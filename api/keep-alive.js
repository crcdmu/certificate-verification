const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Timing-safe token comparison to prevent side-channel attacks
function verifyToken(header, secret) {
  if (!secret || !header) return false;
  const expected = `Bearer ${secret}`;
  if (header.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

module.exports = async function handler(req, res) {
  // Only allow GET (Vercel Cron uses GET)
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Verify the request is from Vercel Cron (not a random visitor)
  if (!verifyToken(req.headers['authorization'], process.env.CRON_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Simple lightweight query to keep the database active
    const { data, error } = await supabase
      .from('certificates')
      .select('id')
      .limit(1);

    if (error) throw error;

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
