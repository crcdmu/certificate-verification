const crypto = require('crypto');
const db = require('./database.json');

module.exports = function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  const { certificateId } = req.body;

  if (!certificateId) {
    return res.status(400).json({ success: false, message: 'Please enter a Certificate ID.' });
  }

  try { cleanId = certificateId.trim().toUpperCase();

    // 1. Convert the incoming "CRC-..." text into a one-way SHA256 hex string
    const hashedInput = crypto
      .createHash('sha256')
      .update(cleanId)
      .digest('hex');

    // 2. Search the database using the HASH as the key, not the text
    const studentRecord = db[hashedInput];

    if (studentRecord) {
      // Re-inject the readable ID & the cryptographic checksum so the UI can print them
      const securePayload = {
        ...studentRecord,
        issuedCertId: cleanId,
        checksum: hashedInput
      };

      return res.status(200).json({ 
        success: true, 
        data: securePayload 
      });
    } else {
      return res.status(404).json({ 
        success: false, 
        message: 'Record not found. This Certificate ID does not exist in the secure archives.' 
      });
    }

  } catch (error) {
    console.error("Crypto/DB Error:", error);
    return res.status(500).json({ success: false, message: 'Secure verification service unavaliable.' });
  }
};
