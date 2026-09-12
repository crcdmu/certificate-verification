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

// SSRF Guard: prevent querying internal/private networks
function isSafeExternalUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    
    // Only allow standard web ports
    if (parsed.port && parsed.port !== '80' && parsed.port !== '443') return false;

    // Normalize hostname: lowercase and strip IPv6 bracket notation if present
    let hostname = parsed.hostname.toLowerCase();
    if (hostname.startsWith('[') && hostname.endsWith(']')) {
      hostname = hostname.slice(1, -1);
    }

    // Check for loopback, local, and unspecified hostnames
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname === '::' ||
      hostname.startsWith('::ffff:')
    ) {
      return false;
    }

    // Block IPv4 private ranges and link-local (10.x, 172.16-31.x, 192.168.x, 169.254.x, 127.x, 0.x)
    if (
      /^10\./.test(hostname) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^169\.254\./.test(hostname) ||
      /^127\./.test(hostname) ||
      /^0\./.test(hostname)
    ) {
      return false;
    }

    // Block IPv6 unique local (fc00::/7) and link-local (fe80::/10)
    if (/^f[cd][0-9a-f]{2}:/i.test(hostname) || /^fe80:/i.test(hostname)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

// Resolver for dynamic/redirect QR URLs (e.g. q.me-qr.com, bit.ly, etc.)
// Uses manual redirect handling, per-hop SSRF validation, and size-bounded body reading.
async function resolveRedirectQrUrl(rawUrl) {
  const directMatch = rawUrl.match(CERT_ID_REGEX) || rawUrl.match(/CRC-\d{8}-[A-Z0-9]{3,5}/i);
  if (directMatch) return directMatch[0].toUpperCase();

  let currentUrl = rawUrl;
  const MAX_HOPS = 3;

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    if (!isSafeExternalUrl(currentUrl)) return null;

    try {
      const response = await fetch(currentUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(5000)
      });

      // Check if redirect response (301, 302, 303, 307, 308)
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) return null;

        // Check if redirect target URL directly contains the certificate ID
        const locMatch = location.match(/CRC-\d{8}-[A-Z0-9]{3,5}/i);
        if (locMatch) return locMatch[0].toUpperCase();

        // Resolve relative or absolute URL against current URL
        try {
          const nextUrl = new URL(location, currentUrl).href;
          currentUrl = nextUrl;
          continue;
        } catch {
          return null;
        }
      }

      if (response.ok) {
        // Enforce max 64KB content size to prevent memory exhaustion
        const reader = response.body?.getReader();
        if (!reader) {
          const text = await response.text();
          const match = text.slice(0, 65536).match(/CRC-\d{8}-[A-Z0-9]{3,5}/i);
          return match ? match[0].toUpperCase() : null;
        }

        let totalBytes = 0;
        const decoder = new TextDecoder();
        let textContent = '';

        while (totalBytes < 65536) {
          const { done, value } = await reader.read();
          if (done) break;
          totalBytes += value.length;
          textContent += decoder.decode(value, { stream: true });
          const streamMatch = textContent.match(/CRC-\d{8}-[A-Z0-9]{3,5}/i);
          if (streamMatch) {
            reader.cancel();
            return streamMatch[0].toUpperCase();
          }
        }
        reader.cancel();
        return null;
      }
      break;
    } catch (err) {
      console.warn('[QR Resolver] Redirect resolution note:', err.message);
      break;
    }
  }
  return null;
}

// Hash Generation (PBKDF2-SHA-256 with 100,000 iterations)
async function generateHash(certificateId, secret) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(certificateId, secret, 100000, 32, 'sha256', (err, derivedKey) => {
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

  const effectiveSecret = process.env.SECRET_SALT || process.env.SECRET_KEY || SECRET_KEY;
  if (!effectiveSecret || effectiveSecret.length < 32) {
    console.error('SECRET_KEY missing or too short');
    return res.status(500).json({ success: false, message: 'Service temporarily unavailable.' });
  }

  const supabase = getSupabase();
  if (!supabase) {
    console.error('Supabase credentials missing');
    return res.status(500).json({ success: false, message: 'Database service configuration error.' });
  }

  // Reliable IP extraction (prioritizing Vercel Edge headers and Express trust proxy)
  const rawIp = 
    req.headers['x-vercel-forwarded-for']?.split(',')[0].trim() ||
    req.ip ||
    req.headers['x-real-ip'] ||
    (req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : null) ||
    req.socket?.remoteAddress ||
    '127.0.0.1';
  
  // Sanitize IP format (IPv4 or IPv6, alphanumeric and colon/dot, max 45 chars)
  const clientIp = /^[a-fA-F0-9:.]+$/.test(rawIp) && rawIp.length <= 45 ? rawIp : '127.0.0.1';
  
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
  let validation = validateCertificateId(certificateId);

  // If initial regex validation failed, check if certificateId is a QR link / redirect URL (e.g. q.me-qr.com)
  if (!validation.valid && typeof certificateId === 'string' && /^https?:\/\//i.test(certificateId.trim())) {
    const resolvedId = await resolveRedirectQrUrl(certificateId.trim());
    if (resolvedId) {
      validation = validateCertificateId(resolvedId);
    }
  }

  if (!validation.valid) {
    return res.status(400).json({ success: false, message: validation.message });
  }

  let candidateHash;
  try {
    candidateHash = await generateHash(validation.cleanId, effectiveSecret);
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

  let qrSvg = null;
  try {
    const QRCode = require('qrcode');
    const verifyUrl = `https://verification-dmu.vercel.app/?id=${encodeURIComponent(validation.cleanId)}`;
    qrSvg = await QRCode.toString(verifyUrl, {
      type: 'svg',
      margin: 0,
      color: {
        dark: '#091a36',
        light: '#ffffff'
      }
    });
  } catch (qrErr) {
    console.warn('[QR Generator] Error generating QR SVG:', qrErr.message);
  }

  return res.status(200).json({ 
    success: true, 
    data: studentData, 
    cleanId: validation.cleanId,
    qrSvg 
  });
};

