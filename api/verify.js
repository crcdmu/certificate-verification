const crypto = require('crypto');
const { createClient } = require('@libsql/client');

// ──────────────────────────────────
// Environment & Constants
// ──────────────────────────────────
const SECRET_KEY = process.env.SECRET_SALT || process.env.SECRET_KEY;
const CERT_ID_REGEX = /^CRC-\d{8}-[A-Z0-9]{3,5}$/;
const WINDOW_SECS = 60;
const MAX_REQUESTS = 10;
const CACHE_TTL = 3600;

const UPSTASH_URL = process.env.UPSTASH_KV_REST_API_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_KV_REST_API_TOKEN;

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://verification-dmu.vercel.app,http://localhost:3000')
  .split(',')
  .map(o => o.trim().replace(/\/$/, '').toLowerCase());

// ──────────────────────────────────
// Turso client (lazy init)
// ──────────────────────────────────
let tursoClient = null;
function getTursoClient() {
  if (!tursoClient) {
    if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
      throw new Error('Missing Turso configuration');
    }
    tursoClient = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return tursoClient;
}

// ──────────────────────────────────
// Upstash Redis Helper (REST API)
// ──────────────────────────────────
async function redisCommand(command, ...args) {
  const url = `${UPSTASH_URL}/${command}/${args.join('/')}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
  });
  const data = await response.json();
  return data.result;
}

// ──────────────────────────────────
// Rate Limiter
// ──────────────────────────────────
async function isRateLimited(ip) {
  const key = `ratelimit:${ip}`;
  try {
    const current = await redisCommand('get', key);
    const count = current ? parseInt(current, 10) : 0;
    if (count >= MAX_REQUESTS) return true;

    if (count === 0) {
      await redisCommand('set', key, 1, 'EX', WINDOW_SECS);
    } else {
      await redisCommand('incr', key);
    }
    return false;
  } catch (err) {
    console.error('Rate limiter error:', err);
    return false;
  }
}

// ──────────────────────────────────
// Cache Helpers
// ──────────────────────────────────
async function getCache(key) {
  try {
    const result = await redisCommand('get', key);
    return result ? JSON.parse(result) : null;
  } catch {
    return null;
  }
}

async function setCache(key, value, ttl) {
  try {
    await redisCommand('set', key, JSON.stringify(value), 'EX', ttl);
  } catch (err) {
    console.error('Cache write error:', err);
  }
}

// ──────────────────────────────────
// Security Headers
// ──────────────────────────────────
function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; style-src 'self' 'unsafe-inline'; form-action 'self'; frame-ancestors 'none';"
  );
}

// ──────────────────────────────────
// CORS Validation
// ──────────────────────────────────
function validateCORS(req, res) {
  const origin = req.headers.origin;
  if (!origin) {
    res.status(403).json({ success: false, message: 'Forbidden: Missing Origin.' });
    return false;
  }
  const normalized = origin.replace(/\/$/, '').toLowerCase();
  if (!ALLOWED_ORIGINS.includes(normalized)) {
    res.status(403).json({ success: false, message: 'Forbidden: Untrusted Origin.' });
    return false;
  }
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return true;
}

// ──────────────────────────────────
// Input Validation
// ──────────────────────────────────
function validateCertificateId(certificateId) {
  if (!certificateId || typeof certificateId !== 'string') {
    return { valid: false, message: 'Please provide a valid Certificate ID.' };
  }
  const cleanId = certificateId.trim().toUpperCase();
  if (!CERT_ID_REGEX.test(cleanId)) {
    return { valid: false, message: 'Invalid Certificate ID format.' };
  }
  return { valid: true, cleanId };
}

// ──────────────────────────────────
// Hash Generation
// ──────────────────────────────────
function generateHash(certificateId) {
  return crypto.pbkdf2Sync(certificateId, SECRET_KEY, 100000, 32, 'sha256').toString('hex');
}

// ──────────────────────────────────
// Main Handler
// ──────────────────────────────────
module.exports = async function handler(req, res) {
  setSecurityHeaders(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed.' });
  }

  if (!SECRET_KEY || SECRET_KEY.length < 32) {
    console.error('SECRET_KEY missing or too short');
    return res.status(500).json({ success: false, message: 'Service temporarily unavailable.' });
  }

  if (!validateCORS(req, res)) return;

  const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  if (await isRateLimited(clientIp)) {
    return res.status(429).json({ success: false, message: 'Too many requests. Please try again later.' });
  }

  let body;
  try {
    if (!req.body || typeof req.body !== 'object') throw new Error();
    body = req.body;
  } catch {
    return res.status(400).json({ success: false, message: 'Invalid request body.' });
  }

  const { certificateId } = body;
  const validation = validateCertificateId(certificateId);
  if (!validation.valid) {
    return res.status(400).json({ success: false, message: validation.message });
  }

  let candidateHash;
  try {
    candidateHash = generateHash(validation.cleanId);
  } catch (err) {
    console.error('Hash generation error:', err);
    return res.status(500).json({ success: false, message: 'Verification error.' });
  }

  // 1) Check cache
  const cached = await getCache(`cert:${candidateHash}`);
  if (cached) {
    return res.status(200).json({ success: true, data: cached });
  }

  // 2) Query Turso
  let db;
  try {
    db = getTursoClient();
  } catch (err) {
    console.error('Turso client init error:', err);
    return res.status(500).json({ success: false, message: 'Service temporarily unavailable.' });
  }

  let row;
  try {
    const result = await db.execute({
      sql: 'SELECT name, programme, issued_on, status FROM certificates WHERE id = ?',
      args: [candidateHash],
    });
    row = result.rows[0];
  } catch (err) {
    console.error('Turso query error:', err);
    return res.status(500).json({ success: false, message: 'Verification service unavailable.' });
  }

  if (!row) {
    return res.status(404).json({ success: false, message: 'Record not found.' });
  }

  const studentData = {
    name: row.name,
    programme: row.programme,
    issuedOn: row.issued_on,
    status: row.status,
  };

  // 3) Populate cache
  await setCache(`cert:${candidateHash}`, studentData, CACHE_TTL);

  return res.status(200).json({ success: true, data: studentData });
};
