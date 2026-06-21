const crypto = require('crypto');
const db = require('./database.json');

const SECRET_KEY = process.env.SECRET_SALT || process.env.SECRET_KEY;
const CERT_ID_REGEX = /^CRC-\d{8}-[A-Z0-9]{3,5}$/;

// 1. IN-MEMORY RATE LIMITER (Blocks enumeration attacks)
const rateLimitMap = new Map();
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 10;     // Max 10 attempts per minute per IP

function isRateLimited(ip) {
  const now = Date.now();
  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, startTime: now });
    return false;
  }
  const record = rateLimitMap.get(ip);
  if (now - record.startTime > WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, startTime: now }); // Reset window
    return false;
  }
  if (record.count >= MAX_REQUESTS) {
    return true; // Block request
  }
  record.count++;
  return false;
}

/**
 * Set security headers on response
 */
function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; style-src 'self' 'unsafe-inline'; form-action 'self'; frame-ancestors 'none';"
  );
}

/**
 * Validate CORS origin (Updated for Strict Match & Block Empty)
 */
function validateCORS(req, res) {
  const allowedOrigins = [
    'https://verification-dmu.vercel.app',
    'http://localhost:5501',
    'http://localhost:3000'
  ];
  let origin = req.headers.origin;

  // Enforce requests must come from a browser context (blocks basic cURL scripts)
  if (!origin) {
    res.status(403).json({ success: false, message: 'Forbidden: Missing Origin.' });
    return false;
  }

  const normalizedOrigin = origin.replace(/\/$/, '').toLowerCase();
  
  // Use Exact Match rather than .includes()
  if (!allowedOrigins.some(o => o.toLowerCase() === normalizedOrigin)) {
    console.error(`CORS Rejection - Origin: "${origin}"`);
    res.status(403).json({ success: false, message: 'Forbidden: Untrusted Origin.' });
    return false;
  }

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return true;
}

/**
 * Validate and sanitize certificate ID
 */
function validateCertificateId(certificateId) {
  if (!certificateId || typeof certificateId !== 'string') {
    return { valid: false, message: 'Please provide a valid Certificate ID.' };
  }
  const cleanId = certificateId.trim().toUpperCase();
  if (cleanId.length > 25 || !CERT_ID_REGEX.test(cleanId)) {
    return { valid: false, message: 'Invalid Certificate ID format.' };
  }
  return { valid: true, cleanId };
}

/**
 * Generate secure certificate verification hash (Updated to slow PBKDF2)
 */
function generateHash(certificateId) {
  // Uses 100,000 iterations to drastically slow down offline brute-force attacks
  return crypto.pbkdf2Sync(certificateId, SECRET_KEY, 100000, 32, 'sha256').toString('hex');
}

/**
 * Main handler
 */
module.exports = function handler(req, res) {
  setSecurityHeaders(res);

  if (!SECRET_KEY || SECRET_KEY.length < 32) {
    return res.status(500).json({ success: false, message: 'Internal Server Configuration Error.' });
  }

  // Handle Rate Limiting
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  if (isRateLimited(clientIp)) {
    return res.status(429).json({ success: false, message: 'Too many requests. Please try again later.' });
  }

  if (!validateCORS(req, res)) return;
  if (req.method === 'OPTIONS') return res.status(204).end();
  
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed.' });
  }

  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json')) {
    return res.status(415).json({ success: false, message: 'Unsupported Media Type.' });
  }

  const { certificateId } = req.body || {};
  const validation = validateCertificateId(certificateId);

  if (!validation.valid) {
    return res.status(400).json({ success: false, message: validation.message });
  }

  try {
    const candidateHash = generateHash(validation.cleanId);
    const studentRecord = db[candidateHash];

    if (studentRecord) {
      return res.status(200).json({
        success: true,
        data: {
          name: studentRecord.name,
          programme: studentRecord.programme,
          issuedOn: studentRecord.issuedOn,
          status: studentRecord.status,
          checksum: candidateHash
        }
      });
    }

    return res.status(404).json({ success: false, message: 'Record not found.' });

  } catch (error) {
    console.error('Certificate Verification Error:', error);
    return res.status(500).json({ success: false, message: 'Verification service temporarily unavailable.' });
  }
};
