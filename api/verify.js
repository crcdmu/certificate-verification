const crypto = require('crypto');
const db = require('./database.json');

// Ensure the environment variable is loaded securely
const SECRET_KEY = process.env.SECRET_SALT || process.env.SECRET_KEY;

// Strict Whitelist RegEx matching DMU Certificate structure: e.g., CRC-20220709-B9M
// 3 letters, hyphen, 8 digits, hyphen, 3-5 uppercase alphanumeric chars
const CERT_ID_REGEX = /^CRC-\d{8}-[A-Z0-9]{3,5}$/;

module.exports = function handler(req, res) {
  // Apply standard security headers to the response
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  // Ensure content-type is strictly JSON
  if (!req.is('application/json')) {
    return res.status(415).json({ success: false, message: 'Unsupported Media Type. Expected application/json.' });
  }

  const { certificateId } = req.body;

  // 1. Strict Input Validation (Mitigates DoS & Buffer issues)
  if (!certificateId || typeof certificateId !== 'string') {
    return res.status(400).json({ success: false, message: 'Invalid request payload.' });
  }

  const cleanId = certificateId.trim().toUpperCase();

  // Enforce strict length and structural boundaries before executing cryptographic functions
  if (cleanId.length > 25 || !CERT_ID_REGEX.test(cleanId)) {
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid Certificate ID format. Expected format: CRC-YYYYMMDD-XXX' 
    });
  }

  if (!SECRET_KEY) {
    console.error("CRITICAL: Server cryptographic secret is not defined!");
    return res.status(500).json({ success: false, message: 'Internal server configuration error.' });
  }

  try {
    // 2. Cryptographic Upgrade: HMAC-SHA256 instead of raw string concatenation
    const candidateHash = crypto
      .createHmac('sha256', SECRET_KEY)
      .update(cleanId)
      .digest('hex');

    // 3. Database lookup
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
