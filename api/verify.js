const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// Environment & Constants
const SECRET_KEY = process.env.SECRET_SALT || process.env.SECRET_KEY;
const CERT_ID_REGEX = /^CRC-\d{8}-[A-Z0-9]{3,5}$/;
const MAX_REQUESTS = 10;
const WINDOW_SECS = 60;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Initialize Supabase Client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://verification-dmu.vercel.app,http://localhost:3000')
  .split(',')
  .map(o => o.trim().replace(/\/$/, '').toLowerCase());

// CORS Validation
function validateCORS(req, res) {
  const origin = req.headers.origin;
  if (!origin) {
    res.status(403).json({ success: false, message: 'Forbidden: Missing Origin.' });
    return false;
  }
  const normalized = origin.replace(/\/$/, '').toLowerCase();
  if (!ALLOWED_ORIGINS.includes(normalized)) {
    res.status(403).json({ success: false, message: 'Forbidden: Untrusted Origin.' });
    return false;
  }
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return true;
}

// Input Validation
function validateCertificateId(certificateId) {
  if (!certificateId || typeof certificateId !== 'string') {
    return { valid: false, message: 'Please provide a valid Certificate ID.' };
  }
  const cleanId = certificateId.trim().toUpperCase();
  if (!CERT_ID_REGEX.test(cleanId)) {
    return { valid: false, message: 'Invalid Certificate ID format.' };
  }
  return { valid: true, cleanId };
}

// Hash Generation (async, non-blocking)
async function generateHash(certificateId) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(certificateId, SECRET_KEY, 100000, 32, 'sha256', (err, derivedKey) => {
      if (err) return reject(err);
      resolve(derivedKey.toString('hex'));
    });
  });
}

// Main Handler
module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed.' });
  }

  if (!SECRET_KEY || SECRET_KEY.length < 32) {
    console.error('SECRET_KEY missing or too short');
    return res.status(500).json({ success: false, message: 'Service temporarily unavailable.' });
  }

  if (!validateCORS(req, res)) return;

  const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  
  // Rate Limiting (Using Supabase RPC Function)
  // Ensure you create the 'increment_rate_limit' function in Supabase as per instructions
  const { data: limitData, error: limitError } = await supabase.rpc('increment_rate_limit', { 
    client_ip: clientIp, 
    max_reqs: MAX_REQUESTS, 
    window_seconds: WINDOW_SECS 
  });

  if (limitError || !limitData.allowed) {
    return res.status(429).json({ success: false, message: 'Too many requests. Please try again later.' });
  }

  let body;
  try {
    if (!req.body || typeof req.body !== 'object') throw new Error();
    body = req.body;
  } catch {
    return res.status(400).json({ success: false, message: 'Invalid request body.' });
  }

  const { certificateId } = body;
  const validation = validateCertificateId(certificateId);
  if (!validation.valid) {
    return res.status(400).json({ success: false, message: validation.message });
  }

  let candidateHash;
  try {
    candidateHash = await generateHash(validation.cleanId);
  } catch (err) {
    console.error('Hash generation error:', err);
    return res.status(500).json({ success: false, message: 'Verification error.' });
  }

  // Query Supabase for the certificate
  const { data: row, error } = await supabase
    .from('certificates')
    .select('name, programme, issued_on, status')
    .eq('id', candidateHash)
    .single();

  if (error) {
    if (error.code === 'PGRST116') { // Postgres error code for 0 rows returned on .single()
      return res.status(404).json({ success: false, message: 'Record not found.' });
    }
    console.error('Supabase query error:', error);
    return res.status(500).json({ success: false, message: 'Verification service unavailable.' });
  }

  const studentData = {
    name: row.name,
    programme: row.programme,
    issuedOn: row.issued_on,
    status: row.status,
  };

  return res.status(200).json({ success: true, data: studentData });
};
