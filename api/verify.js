const crypto = require('crypto');
const db = require('./database.json');

// Must match the migrator's salt exactly
const SECRET_SALT = "DMU_CRPC_SECURE_ARCHIVE_SALT_2026_#k9X!p";

module.exports = function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  const { certificateId } = req.body;

  if (!certificateId) {
    return res.status(400).json({ success: false, message: 'Please enter a Certificate ID.' });
  }

  try {
    const cleanId = certificateId.trim().toUpperCase();

    // 1. Salt and Hash the user's input
    const saltedInput = cleanId + SECRET_SALT;
    const candidateHash = crypto.createHash('sha256').update(saltedInput).digest('hex');

    // 2. Look up the salted hash in the JSON
    const studentRecord = db[candidateHash];

    if (studentRecord) {
      return res.status(200).json({ 
        success: true, 
        data: {
          ...studentRecord,
          checksum: candidateHash // Send the signature to the browser silently
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
