const crypto = require('crypto');
const db = require('./database.json');

const SECRET_KEY = process.env.SECRET_SALT || process.env.SECRET_KEY;
const CERT_ID_REGEX = /^CRC-\d{8}-[A-Z0-9]{3,5}$/;

// Vulnerability #1 Fix: In-memory rate limiter map for warm serverless instances
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window
const RATE_LIMIT_MAX_REQUESTS = 10;     // Max 10 requests per IP per minute

module.exports = function handler(req, res) {
  // Vulnerability #4 Fix: Inject clickjacking & DOM XSS defense-in-depth headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; style-src 'self' 'unsafe-inline'; form-action 'self'; frame-ancestors 'none';"
  );

  // Vulnerability #5 Fix: Explicit CORS & Preflight validation
  const allowedOrigins = [
    'https://your-official-domain.com', // Replace with your production domain
    'http://localhost:5501',
    'http://localhost:3000'
  ];
  const origin = req.headers.origin;

  if (origin) {
    if (!allowedOrigins.includes(origin)) {
      return res.status(403).json({ success: false, message: 'Forbidden: Untrusted Origin.' });
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  // Handle CORS Preflight (OPTIONS)
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed. Use POST.' });
  }

  // Vulnerability #1 Fix: Execute rate limit evaluation
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown-ip';
  const now = Date.now();
  const record = rateLimitMap.get(clientIp) || { count: 0, startTime: now };

  if (now - record.startTime > RATE_LIMIT_WINDOW_MS) {
    record.count = 1;
    record.startTime = now;
  } else {
    record.count += 1;
    if (record.count > RATE_LIMIT_MAX_REQUESTS) {
      return res.status(429).json({ 
        success: false, 
        message: 'Too many verification attempts. Please wait 60 seconds and try again.' 
      });
    }
  }
  rateLimitMap.set(clientIp, record);

  // Validate Content-Type
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json')) {
    return res.status(415).json({ success: false, message: 'Unsupported Media Type.' });
  }

  const { certificateId } = req.body || {};
  if (!certificateId || typeof certificateId !== 'string') {
    return res.status(400).json({ success: false, message: 'Please provide a valid Certificate ID.' });
  }

  const cleanId = certificateId.trim().toUpperCase();
  if (cleanId.length > 25 || !CERT_ID_REGEX.test(cleanId)) {
    return res.status(400).json({ success: false, message: 'Invalid Certificate ID format.' });
  }

  // Vulnerability #3 Fix: Enforce minimum entropy on the secret key
  if (!SECRET_KEY || SECRET_KEY.length < 32) {
    console.error("CRITICAL SECURITY ERROR: SECRET_KEY is missing or insecure (under 32 chars)!");
    return res.status(500).json({ success: false, message: 'Internal server configuration error.' });
  }

  try {
    const candidateHash = crypto
      .createHmac('sha256', SECRET_KEY)
      .update(cleanId)
      .digest('hex');

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
    } else {
      return res.status(404).json({ 
        success: false, 
        message: 'Record not found. This Certificate ID does not exist in Dhanamanjuri University CR&PC archives.' 
      });
    }

  } catch (error) {
    console.error("Secure Verification Error:", error);
    return res.status(500).json({ success: false, message: 'Secure verification service unavailable.' });
  }
};
