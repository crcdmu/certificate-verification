const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

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

// Timing-safe token comparison to prevent side-channel attacks
function verifyToken(header, secret) {
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`, 'utf8');
  const actual = Buffer.from(header, 'utf8');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  // Only allow GET (Vercel Cron uses GET)
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Verify the request is from Vercel Cron (not a random visitor)
  if (!verifyToken(req.headers['authorization'], process.env.CRON_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(500).json({ success: false, message: 'Database credentials unconfigured.' });
  }

  try {
    // Attempt lightweight ping() RPC function first
    let pingSuccess = false;
    try {
      const { error: pingError } = await supabase.rpc('ping');
      if (!pingError) {
        pingSuccess = true;
      }
    } catch {
      pingSuccess = false;
    }

    // Fallback to table query if ping() RPC is not yet created in PostgreSQL
    if (!pingSuccess) {
      const { error } = await supabase
        .from('certificates')
        .select('id')
        .limit(1);

      if (error) throw error;
    }

    return res.status(200).json({
      success: true,
      message: 'Database pinged successfully.',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Keep-alive ping failed:', err);
    return res.status(500).json({
      success: false,
      message: 'Ping failed.',
    });
  }
};
