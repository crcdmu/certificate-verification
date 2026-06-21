const crypto = require('crypto');
const db = require('./database.json');

const SECRET_KEY = process.env.SECRET_SALT || process.env.SECRET_KEY;
const CERT_ID_REGEX = /^CRC-\d{8}-[A-Z0-9]{3,5}$/;

// Vulnerability #1 Fix: In-memory rate limiter map
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 10;

module.exports = function handler(req, res) {
  // Vulnerability #4 Fix: Security Headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; style-src 'self' 'unsafe-inline'; form-action 'self'; frame-ancestors 'none';"
  );

  // Vulnerability #5 Fix: CORS Validation
  const allowedOrigins = [
    'https://verification-dmu.vercel.app',
    'http://localhost:5501',
    'http://localhost:3000'
  ];
  
  const origin = req.headers.origin;

  if (origin) {
    // Allow if in whitelist OR if it's a Vercel preview branch
    const isAllowed = allowedOrigins.includes(origin) || origin.endsWith('.vercel.app');

    if (!isAllowed) {
      return res.status(403).json({ success: false, message: 'Forbidden: Untrusted Origin.' });
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed.' });
  }

  // Rate Limiting Logic
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const record = rateLimitMap.get(clientIp) || { count: 0, startTime: now };

  if (now - record.startTime > RATE_LIMIT_WINDOW_MS) {
    record.count = 1;
    record.startTime = now;
  } else {
    record.count += 1;
    if (record.count > RATE_LIMIT_MAX_REQUESTS) {
      return res.status(429).json({ success: false, message: 'Too many attempts. Wait 60s.' });
    }
  }
  rateLimitMap.set(clientIp, record);

  // Input Validation
  const { certificateId } = req.body || {};
  if (!certificateId || typeof certificateId !== 'string') {
    return res.status(400).json({ success: false, message: 'Invalid ID.' });
  }

  const cleanId = certificateId.trim().toUpperCase();
  if (!CERT_ID_REGEX.test(cleanId)) {
    return res.status(400).json({ success: false, message: 'Invalid Format.' });
  }

  if (!SECRET_KEY || SECRET_KEY.length < 32) {
    return res.status(500).json({ success: false, message: 'Server configuration error.' });
  }

  // Verification Logic
  try {
    const candidateHash = crypto.createHmac('sha256', SECRET_KEY).update(cleanId).digest('hex');
    const studentRecord = db[candidateHash];

    if (studentRecord) {
      return res.status(200).json({ success: true, data: studentRecord });
    } else {
      return res.status(404).json({ success: false, message: 'Record not found.' });
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};
