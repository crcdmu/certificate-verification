const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// Environment & Constants
const SECRET_KEY = process.env.SECRET_SALT || process.env.SECRET_KEY;
const CERT_ID_REGEX = /^CRC-\d{8}-[A-Z0-9]{3,5}$/;
const MAX_REQUESTS = 10;
const WINDOW_SECS = 60;

let cachedSupabase = null;
function getSupabase() {
  if (!cachedSupabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    cachedSupabase = createClient(url, key);
  }
  return cachedSupabase;
}

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://verification-dmu.vercel.app,http://localhost:3000,http://127.0.0.1:3000')
  .split(',')
  .map(o => o.trim().replace(/\/$/, '').toLowerCase());

// CORS Validation
function validateCORS(req, res) {
  const origin = req.headers.origin;
  if (!origin) {
    // Same-origin or non-browser request without Origin header
    return true;
  }
  const normalized = origin.replace(/\/$/, '').toLowerCase();
  if (!ALLOWED_ORIGINS.includes(normalized)) {
    res.status(403).json({ success: false, message: 'Forbidden: Untrusted Origin.' });
    return false;
  }
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
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

// Hash Generation (PBKDF2-SHA-256 with 100,000 iterations)
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
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (!validateCORS(req, res)) return;
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed.' });
  }

  if (!SECRET_KEY || SECRET_KEY.length < 32) {
    console.error('SECRET_KEY missing or too short');
    return res.status(500).json({ success: false, message: 'Service temporarily unavailable.' });
  }

  const supabase = getSupabase();
  if (!supabase) {
    console.error('Supabase credentials missing');
    return res.status(500).json({ success: false, message: 'Database service configuration error.' });
  }

  // Reliable IP extraction (prioritizing Vercel Edge headers)
  const clientIp = 
    req.headers['x-vercel-forwarded-for']?.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    (req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : null) ||
    req.socket?.remoteAddress ||
    '127.0.0.1';
  
  // Rate Limiting (Using Supabase RPC Function)
  const { data: limitData, error: limitError } = await supabase.rpc('increment_rate_limit', { 
    client_ip: clientIp, 
    max_reqs: MAX_REQUESTS, 
    window_seconds: WINDOW_SECS 
  });

  // Handle Database/RPC errors
  if (limitError) {
    console.error('Supabase RPC Error:', limitError);
    return res.status(500).json({ success: false, message: 'Internal Server Error during verification.' });
  }

  // Handle Rate Limit exceeded
  if (!limitData || !limitData.allowed) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ success: false, message: 'Too many requests. Please try again later.' });
  }

  let body;
  try {
    if (!req.body) throw new Error();
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (typeof body !== 'object' || body === null) throw new Error();
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

  // Dual lookup compatibility: Try get_certificate_by_hash RPC first, fallback to direct query
  let row = null;
  let rpcAttempted = false;

  try {
    const { data: rpcRows, error: rpcError } = await supabase.rpc('get_certificate_by_hash', { 
      p_hash: candidateHash 
    });
    if (!rpcError) {
      rpcAttempted = true;
      if (rpcRows && rpcRows.length > 0) {
        row = rpcRows[0];
      }
    }
  } catch {
    rpcAttempted = false;
  }

  // Fallback to table query if RPC is not deployed yet in PostgreSQL
  if (!rpcAttempted) {
    const { data: directRow, error: directError } = await supabase
      .from('certificates')
      .select('name, programme, issued_on, status')
      .eq('id', candidateHash)
      .single();

    if (directError) {
      if (directError.code === 'PGRST116') { // Postgres code for 0 rows returned
        return res.status(404).json({ success: false, message: 'Record not found.' });
      }
      console.error('Supabase query error:', directError);
      return res.status(500).json({ success: false, message: 'Verification service unavailable.' });
    }
    row = directRow;
  } else if (!row) {
    return res.status(404).json({ success: false, message: 'Record not found.' });
  }

  const studentData = {
    name: row.name,
    programme: row.programme,
    issuedOn: row.issued_on,
    status: row.status,
  };

  return res.status(200).json({ success: true, data: studentData, cleanId: validation.cleanId });
};
