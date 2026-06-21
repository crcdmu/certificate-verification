const crypto = require('crypto');
const db = require('./database.json');

const SECRET_KEY = process.env.SECRET_SALT || process.env.SECRET_KEY;
const CERT_ID_REGEX = /^CRC-\d{8}-[A-Z0-9]{3,5}$/;

// Rate limiting configuration
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window
const RATE_LIMIT_MAX_REQUESTS = 10;     // Max 10 requests per IP per minute
const RATE_LIMIT_CLEANUP_INTERVAL = 5 * 60 * 1000; // Cleanup every 5 minutes

// Validate SECRET_KEY on startup
if (!SECRET_KEY || SECRET_KEY.length < 32) {
  console.error("CRITICAL SECURITY ERROR: SECRET_KEY is missing or insecure (under 32 chars)!");
  process.exit(1);
}

/**
 * Clean up stale rate limit entries
 */
function cleanupRateLimitMap() {
  const now = Date.now();
  let cleaned = 0;
  for (const [ip, record] of rateLimitMap.entries()) {
    if (now - record.startTime > RATE_LIMIT_WINDOW_MS * 2) {
      rateLimitMap.delete(ip);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`Rate limit cleanup: removed ${cleaned} stale entries`);
  }
}

// Schedule periodic cleanup
setInterval(cleanupRateLimitMap, RATE_LIMIT_CLEANUP_INTERVAL);

/**
 * Set security headers on response
 */
function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; style-src 'self' 'unsafe-inline'; form-action 'self'; frame-ancestors 'none';"
  );
}

/**
 * Validate CORS origin
 */
function validateCORS(req, res) {
  const allowedOrigins = [
    'https://verification-dmu.vercel.app',
    'http://localhost:5501',
    'http://localhost:3000'
  ];
  const origin = req.headers.origin;

  if (!origin) {
    return true; // Allow if no origin header (server-to-server requests)
  }

  if (!allowedOrigins.includes(origin)) {
    res.status(403).json({ success: false, message: 'Forbidden: Untrusted Origin.' });
    return false;
  }

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return true;
}

/**
 * Check rate limit for client IP
 */
function checkRateLimit(clientIp) {
  const now = Date.now();
  const record = rateLimitMap.get(clientIp) || { count: 0, startTime: now };

  if (now - record.startTime > RATE_LIMIT_WINDOW_MS) {
    record.count = 1;
    record.startTime = now;
  } else {
    record.count += 1;
    if (record.count > RATE_LIMIT_MAX_REQUESTS) {
      return { allowed: false };
    }
  }

  rateLimitMap.set(clientIp, record);
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - record.count };
}

/**
 * Validate and sanitize certificate ID
 */
function validateCertificateId(certificateId) {
  if (!certificateId || typeof certificateId !== 'string') {
    return { valid: false, message: 'Please provide a valid Certificate ID.' };
  }

  const cleanId = certificateId.trim().toUpperCase();

  if (cleanId.length > 25 || !CERT_ID_REGEX.test(cleanId)) {
    return { valid: false, message: 'Invalid Certificate ID format. Expected format: CRC-YYYYMMDD-XXX' };
  }

  return { valid: true, cleanId };
}

/**
 * Generate certificate verification hash
 */
function generateHash(certificateId) {
  return crypto
    .createHmac('sha256', SECRET_KEY)
    .update(certificateId)
    .digest('hex');
}

/**
 * Main handler
 */
module.exports = function handler(req, res) {
  // Set security headers
  setSecurityHeaders(res);

  // Validate CORS
  if (!validateCORS(req, res)) {
    return;
  }

  // Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed. Use POST.' });
  }

  // Get client IP for rate limiting
  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown-ip').split(',')[0].trim();

  // Check rate limit
  const rateLimitCheck = checkRateLimit(clientIp);
  if (!rateLimitCheck.allowed) {
    return res.status(429).json({
      success: false,
      message: 'Too many verification attempts. Please wait 60 seconds and try again.',
      retryAfter: 60
    });
  }

  // Validate Content-Type
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json')) {
    return res.status(415).json({ success: false, message: 'Unsupported Media Type. Use application/json.' });
  }

  // Extract and validate certificate ID
  const { certificateId } = req.body || {};
  const validation = validateCertificateId(certificateId);

  if (!validation.valid) {
    return res.status(400).json({ success: false, message: validation.message });
  }

  try {
    // Generate hash and lookup record
    const candidateHash = generateHash(validation.cleanId);
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
    }

    return res.status(404).json({
      success: false,
      message: 'Record not found. This Certificate ID does not exist in Dhanamanjuri University CR&PC archives.'
    });

  } catch (error) {
    console.error('Certificate Verification Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Verification service temporarily unavailable.'
    });
  }
};
