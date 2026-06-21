const crypto = require('crypto');
// If Option 1 (moving data folder) was used, ensure this path points to '../data/database.json'
const db = require('./database.json');

// Ensure the environment variable is loaded securely
const SECRET_KEY = process.env.SECRET_SALT || process.env.SECRET_KEY;

// Strict Whitelist RegEx matching DMU Certificate structure: e.g., CRC-20220709-B9M
const CERT_ID_REGEX = /^CRC-\d{8}-[A-Z0-9]{3,5}$/;

module.exports = function handler(req, res) {
  // Apply standard security headers to the response
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  // 1. Check HTTP Method first
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed. Use POST.' });
  }

  // 2. Safely inspect Content-Type in native Node.js / Vercel Serverless
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json')) {
    return res.status(415).json({ 
      success: false, 
      message: 'Unsupported Media Type. Expected application/json.' 
    });
  }

  const { certificateId } = req.body || {};

  // 3. Strict Input Validation
  if (!certificateId || typeof certificateId !== 'string') {
    return res.status(400).json({ success: false, message: 'Please provide a valid Certificate ID.' });
  }

  const cleanId = certificateId.trim().toUpperCase();

  // Enforce strict length and structural boundaries
  if (cleanId.length > 25 || !CERT_ID_REGEX.test(cleanId)) {
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid Certificate ID format. Expected format: CRC-YYYYMMDD-XXX' 
    });
  }

  if (!SECRET_KEY) {
    console.error("CRITICAL: Server cryptographic secret is not defined in Vercel Environment Variables!");
    return res.status(500).json({ success: false, message: 'Internal server configuration error.' });
  }

  try {
    // 4. Cryptographic HMAC-SHA256 lookup
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
