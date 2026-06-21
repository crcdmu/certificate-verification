const crypto = require('crypto');
// Using dynamic pathing to ensure the database file is found correctly
const db = require('./database.json');

module.exports = async function handler(req, res) {
  // 1. Security Headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none';");

  // 2. CORS Handling
  const origin = req.headers.origin;
  const allowed = ['https://verification-dmu.vercel.app', 'http://localhost:3000', 'http://localhost:5501'];
  
  if (origin && (allowed.includes(origin) || origin.endsWith('.vercel.app'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  // 3. Verification Logic
  const { certificateId } = req.body || {};
  if (!certificateId || typeof certificateId !== 'string') {
    return res.status(400).json({ success: false, message: 'Invalid request' });
  }

  const cleanId = certificateId.trim().toUpperCase();
  const secret = process.env.SECRET_KEY || process.env.SECRET_SALT;

  try {
    if (!secret || secret.length < 32) throw new Error('Insecure config');
    
    const hash = crypto.createHmac('sha256', secret).update(cleanId).digest('hex');
    const record = db[hash];

    if (record) {
      return res.status(200).json({ success: true, data: record });
    }
    return res.status(404).json({ success: false, message: 'Record not found' });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
