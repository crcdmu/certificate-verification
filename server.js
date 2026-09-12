const express = require('express');
const path = require('path');
const fs = require('fs');

// Attempt to load environment variables from .env.local or .env
const envFiles = ['.env.local', '.env'];
for (const file of envFiles) {
  const envPath = path.join(__dirname, file);
  if (fs.existsSync(envPath)) {
    if (process.loadEnvFile) {
      process.loadEnvFile(envPath);
      console.log(`[ENV] Loaded environment variables from ${file}`);
    }
    break;
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');

// Security Headers Middleware (matching production standards)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  next();
});

app.use(express.json());

// API Endpoints mounting
const hasSupabaseCreds = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);

if (hasSupabaseCreds) {
  try {
    const verifyHandler = require('./api/verify');
    const keepAliveHandler = require('./api/keep-alive');

    app.all('/api/verify', (req, res) => verifyHandler(req, res));
    app.all('/api/keep-alive', (req, res) => keepAliveHandler(req, res));
    console.log('[API] /api/verify and /api/keep-alive mounted successfully.');
  } catch (err) {
    console.error('[API Error] Failed to mount API routes:', err.message);
  }
} else {
  console.warn(
    '\n⚠️  [NOTICE] SUPABASE_URL and/or SUPABASE_ANON_KEY environment variables are not set.\n' +
    '   Static frontend is active at http://localhost:' + PORT + '.\n' +
    '   To enable certificate verification queries, copy .env.example to .env or .env.local and fill in your Supabase credentials.\n'
  );

  app.all('/api/verify', (req, res) => {
    res.status(503).json({
      success: false,
      message: 'Supabase credentials missing on localhost. Please configure SUPABASE_URL and SUPABASE_ANON_KEY in .env.local or .env.'
    });
  });

  app.all('/api/keep-alive', (req, res) => {
    res.status(503).json({
      success: false,
      message: 'Keep-alive disabled: Supabase credentials missing.'
    });
  });
}

app.set('trust proxy', 1);

// Security Guard: Prevent serving raw backend files, environment files, or scripts
app.use((req, res, next) => {
  const cleanPath = (req.path || '').toLowerCase();
  const blockedExact = ['/server.js', '/package.json', '/package-lock.json', '/readme.md', '/schema.sql'];
  
  if (
    blockedExact.includes(cleanPath) ||
    cleanPath.startsWith('/api/') ||
    cleanPath.includes('.env')
  ) {
    return res.status(403).type('text/plain').send('Access denied');
  }
  next();
});

// Serve static assets with clean URLs (e.g. /privacy -> privacy.html) and deny hidden files
app.use(express.static(__dirname, { extensions: ['html'], dotfiles: 'deny' }));

// Global Error Handler (catches malformed JSON payloads and unexpected errors without stack trace leakage)
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ success: false, message: 'Invalid JSON payload.' });
  }
  console.error('[Server Error]', err);
  return res.status(500).json({ success: false, message: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Verification portal server running at http://localhost:${PORT}`);
  console.log(`   Open http://localhost:${PORT} in your browser to test.\n`);
});
