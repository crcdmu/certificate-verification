const crypto = require('crypto');
const { createClient } = require('@libsql/client');


// Environment & Constants

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


// Turso client (lazy init)

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


// Upstash Redis Helper (REST API)

async function redisCommand(command, ...args) {
  const encodedArgs = args.map(arg => encodeURIComponent(arg)).join('/');
  const url = `${UPSTASH_URL}/${command}/${encodedArgs}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
  });
  const data = await response.json();
  return data.result;
}


// Rate Limiter (atomic, defensive)

async function isRateLimited(ip) {
  const key = `ratelimit:${ip}`;
  try {
    const count = await redisCommand('incr', key);
    if (count === 1) {
      try {
        await redisCommand('expire', key, WINDOW_SECS);
      } catch {
        // If expire fails, delete the orphaned key to prevent permanently rate-limiting this IP
        await redisCommand('del', key);
        return false;
      }
    }
    if (count > MAX_REQUESTS) return true;
    return false;
  } catch (err) {
    console.error('Rate limiter error:', err);
    return false;
  }
}


// Cache Helpers (URL-encoded safe)

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


// CORS Validation
// NOTE: This validates the Origin header to prevent cross-site requests from browsers. 
// It is NOT a security boundary against non-browser clients (curl, scripts) 
// — the Origin header is trivially forgeable. Actual abuse protection relies on the
// IP-based rate limiter (isRateLimited) which is the real gate.

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


// Input Validation

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


// Hash Generation (async, non-blocking)

async function generateHash(certificateId) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(certificateId, SECRET_KEY, 100000, 32, 'sha256', (err, derivedKey) => {
      if (err) return reject(err);
      resolve(derivedKey.toString('hex'));
    });
  });
}


// Main Handler

module.exports = async function handler(req, res) {
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
    candidateHash = await generateHash(validation.cleanId);
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