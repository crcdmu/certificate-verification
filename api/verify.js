const crypto = require('crypto');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// FIX: Switch from @vercel/kv to standard redis package
const { createClient } = require('redis');

let redisClient = null;

async function getRedisClient() {
  if (!redisClient) {
    // Falls back to any of the keys populated by your Vercel panel
    const url = process.env.REDIS_URL || process.env.KV_REDIS_URL || process.env.KV_URL;
    redisClient = createClient({ url });
    redisClient.on('error', (err) => console.error('Redis Client Error', err));
    await redisClient.connect();
  }
  return redisClient;
}

const SECRET_KEY = process.env.SECRET_SALT || process.env.SECRET_KEY;
const CERT_ID_REGEX = /^CRC-\d{8}-[A-Z0-9]{3,5}$/;
const WINDOW_SECS = 60; 
const MAX_REQUESTS = 10; 

async function isRateLimited(ip) {
  const key = `ratelimit:${ip}`;
  try {
    const client = await getRedisClient();
    const currentRequests = await client.get(key) || 0;
    if (parseInt(currentRequests, 10) >= MAX_REQUESTS) return true;
    
    const multi = client.multi();
    multi.incr(key);
    if (parseInt(currentRequests, 10) === 0) {
      multi.expire(key, WINDOW_SECS);
    }
    await multi.exec();
    return false;
  } catch (error) {
    console.error('Redis Rate Limit Error:', error);
    return false; // Fail open to keep site functional during database issues
  }
}

// Security headers and CORS sections stay exactly the same...
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

const serviceAccountAuth = new JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') : '',
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

module.exports = async function handler(req, res) {
  setSecurityHeaders(res);

  if (!SECRET_KEY || SECRET_KEY.length < 32) {
    return res.status(500).json({ success: false, message: 'Internal Server Configuration Error.' });
  }

  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const rateLimited = await isRateLimited(clientIp);
  
  if (rateLimited) {
    return res.status(429).json({ success: false, message: 'Too many requests. Please try again later.' });
  }

  if (!validateCORS(req, res)) return;
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method Not Allowed.' });

  const { certificateId } = req.body || {};
  const validation = validateCertificateId(certificateId);

  if (!validation.valid) {
    return res.status(400).json({ success: false, message: validation.message });
  }

  try {
    const candidateHash = generateHash(validation.cleanId);
    const client = await getRedisClient();

    // Fast indexed read lookup
    const cachedData = await client.get(`cert:${candidateHash}`);
    if (cachedData) {
      return res.status(200).json({ success: true, data: JSON.parse(cachedData) });
    }

    // Fallback to Google Sheets index rebuild
    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();

    let foundRecord = null;

    for (const row of rows) {
      const hash = row.get('Checksum');
      const studentData = {
        name: row.get('Name'),
        programme: row.get('Programme'),
        issuedOn: row.get('IssuedOn'),
        status: row.get('Status')
      };
      
      // Cache item as a stringified object for 1 hour
      await client.set(`cert:${hash}`, JSON.stringify(studentData), { EX: 3600 });
      if (hash === candidateHash) foundRecord = studentData;
    }

    if (foundRecord) {
      return res.status(200).json({ success: true, data: foundRecord });
    }

    return res.status(404).json({ success: false, message: 'Record not found.' });

  } catch (error) {
    console.error('Database Connection Error:', error);
    return res.status(500).json({ success: false, message: 'Verification service temporarily unavailable.' });
  }
};