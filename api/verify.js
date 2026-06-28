const crypto = require('crypto');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const SECRET_KEY = process.env.SECRET_SALT || process.env.SECRET_KEY;
const CERT_ID_REGEX = /^CRC-\d{8}-[A-Z0-9]{3,5}$/;

// 1. IN-MEMORY RATE LIMITER
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
    rateLimitMap.set(ip, { count: 1, startTime: now });
    return false;
  }
  if (record.count >= MAX_REQUESTS) return true;
  record.count++;
  return false;
}

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; style-src 'self' 'unsafe-inline'; form-action 'self'; frame-ancestors 'none';"
  );
}

function validateCORS(req, res) {
  const allowedOrigins = [
    'https://verification-dmu.vercel.app',
    'http://localhost:5501',
    'http://localhost:3000'
  ];
  let origin = req.headers.origin;

  if (!origin) {
    res.status(403).json({ success: false, message: 'Forbidden: Missing Origin.' });
    return false;
  }

  const normalizedOrigin = origin.replace(/\/$/, '').toLowerCase();
  if (!allowedOrigins.some(o => o.toLowerCase() === normalizedOrigin)) {
    res.status(403).json({ success: false, message: 'Forbidden: Untrusted Origin.' });
    return false;
  }

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return true;
}

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

function generateHash(certificateId) {
  return crypto.pbkdf2Sync(certificateId, SECRET_KEY, 100000, 32, 'sha256').toString('hex');
}

// 2. GOOGLE SHEETS AUTHENTICATION CLIENT
const serviceAccountAuth = new JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  // Vercel stores newline characters as literally "\n", this regex fixes it:
  key: process.env.GOOGLE_PRIVATE_KEY ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') : '',
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

module.exports = async function handler(req, res) {
  setSecurityHeaders(res);

  if (!SECRET_KEY || SECRET_KEY.length < 32) {
    return res.status(500).json({ success: false, message: 'Internal Server Configuration Error.' });
  }

  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  if (isRateLimited(clientIp)) {
    return res.status(429).json({ success: false, message: 'Too many requests. Please try again later.' });
  }

  if (!validateCORS(req, res)) return;
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed.' });
  }

  const { certificateId } = req.body || {};
  const validation = validateCertificateId(certificateId);

  if (!validation.valid) {
    return res.status(400).json({ success: false, message: validation.message });
  }

  try {
    const candidateHash = generateHash(validation.cleanId);

    // 3. FETCH RECORD FROM GOOGLE SHEET
    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0]; // Gets the first tab
    const rows = await sheet.getRows();

    const studentRecord = rows.find(row => row.get('Checksum') === candidateHash);

    if (studentRecord) {
      return res.status(200).json({
        success: true,
        data: {
          name: studentRecord.get('Name'),
          programme: studentRecord.get('Programme'),
          issuedOn: studentRecord.get('IssuedOn'),
          status: studentRecord.get('Status'),
          checksum: candidateHash
        }
      });
    }

    return res.status(404).json({ success: false, message: 'Record not found.' });

  } catch (error) {
    console.error('Database Connection Error:', error);
    return res.status(500).json({ success: false, message: 'Verification service temporarily unavailable.' });
  }
};
