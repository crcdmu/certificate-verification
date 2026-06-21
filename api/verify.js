const crypto = require('crypto');
const db = require('./database.json');

const SECRET_KEY = process.env.SECRET_SALT || process.env.SECRET_KEY;
const CERT_ID_REGEX = /^CRC-\d{8}-[A-Z0-9]{3,5}$/;

module.exports = function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed. Use POST.' });
  }

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

  if (!SECRET_KEY) {
    console.error("CRITICAL ERROR: Secret key is missing from Vercel Environment Variables!");
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
