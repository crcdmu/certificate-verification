// api/verify.js
// Written in strict CommonJS to run natively on Vercel without a package.json

module.exports = function handler(req, res) {
  // 1. Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  const { certificateId } = req.body;

  if (!certificateId) {
    return res.status(400).json({ success: false, message: 'Please enter a Certificate ID.' });
  }

  try {
    // NATIVE COMMONJS IMPORT:
    // This automatically tells Vercel to bundle database.json AND instantly parses it into a JS object.
    const db = require('./database.json');

    const cleanId = certificateId.trim().toUpperCase();
    const studentRecord = db[cleanId];

    if (studentRecord) {
      return res.status(200).json({ 
        success: true, 
        data: studentRecord 
      });
    } else {
      return res.status(404).json({ 
        success: false, 
        message: 'Record not found. This Certificate ID does not exist in Dhanamanjuri University CR&PC archives.' 
      });
    }

  } catch (error) {
    console.error("Vercel Execution Error:", error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal Server Error: Unable to read database.' 
    });
  }
};
