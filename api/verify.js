const crypto = require('crypto');
const db = require('./database.json');

const SECRET_KEY = process.env.SECRET_SALT || process.env.SECRET_KEY;
const CERT_ID_REGEX = /^CRC-\d{8}-[A-Z0-9]{3,5}$/;

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
 * Validate CORS origin
 */
function validateCORS(req, res) {
  const allowedOrigins = [
    'https://verification-dmu.vercel.app',
    'http://localhost:5501',
    'http://localhost:3000'
  ];
  let origin = req.headers.origin;

  if (!origin) return true; 

  const normalizedOrigin = origin.replace(/\/$/, '').toLowerCase();
  const normalizedAllowedOrigins = allowedOrigins.map(o => o.replace(/\/$/, '').toLowerCase());

  if (!normalizedAllowedOrigins.includes(normalizedOrigin)) {
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
    return { valid: false, message: 'Invalid Certificate ID format. Expected format: CRC-YYYYMMDD-XXX' };
  }

  return { valid: true, cleanId };
}

/**
 * Generate certificate verification hash
 */
function generateHash(certificateId) {
  return crypto
    .createHmac('sha256', SECRET_KEY)
    .update(certificateId)
    .digest('hex');
}

/**
 * Main handler
 */
module.exports = function handler(req, res) {
  setSecurityHeaders(res);

  // RUNTIME SECURITY CHECK: Prevents build crashes while maintaining strict security
  if (!SECRET_KEY || SECRET_KEY.length < 32) {
    console.error("CRITICAL SECURITY ERROR: SECRET_KEY is missing or insecure (under 32 chars)!");
    return res.status(500).json({ success: false, message: 'Internal Server Configuration Error.' });
  }

  if (!validateCORS(req, res)) return;
  if (req.method === 'OPTIONS') return res.status(204).end();
  
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed. Use POST.' });
  }

  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json')) {
    return res.status(415).json({ success: false, message: 'Unsupported Media Type. Use application/json.' });
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

    return res.status(404).json({
      success: false,
      message: 'Record not found. This Certificate ID does not exist in Dhanamanjuri University CR&PC archives.'
    });

  } catch (error) {
    console.error('Certificate Verification Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Verification service temporarily unavailable.'
    });
  }
};
