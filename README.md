# Certificate Verification Portal – CR&PC, Dhanamanjuri University

Unofficial certificate verification portal for the **Campus Recruitment & Placement Cell (CR&PC)** of Dhanamanjuri University, Imphal, Manipur.  
Employers, recruiters, and students can instantly verify the authenticity of certificates issued by CR&PC.

> **Live URL:** [https://verification-dmu.vercel.app](https://verification-dmu.vercel.app)

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [How It Works](#how-it-works)
- [Tech Stack (Free Tier)](#tech-stack-free-tier)
- [Project Structure](#project-structure)
- [Database Schema & RPC](#database-schema--rpc)
- [Environment Variables](#environment-variables)
- [Security](#security)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **Instant verification** – Enter a certificate ID or scan a QR code to verify records in real-time.
- **Zero-knowledge architecture** – Plain-text certificate IDs are never stored or logged in the database; lookups use PBKDF2-hashed keys.
- **Rate-limited & abuse-protected** – Database-level atomic IP-based rate limiting (10 requests/minute per IP) and strict CORS validation prevent brute-force attacks.
- **Automated Keep-Alive** – Scheduled cron job pings the database daily via an authenticated endpoint to prevent free-tier instance idling or cold starts.
- **Secure by default** – CSP, HSTS, X-Frame-Options, no-referrer, and permissions policies configured globally via `vercel.json`.
- **Completely free to run** – Built using services with generous free tiers (Vercel serverless + Supabase).
- **Mobile-first responsive design** – Sleek, modern interface styled with vanilla CSS, supporting mobile, tablet, and desktop viewports.
- **No cookies or user tracking** – Privacy-first design with zero analytics trackers, third-party cookies, or profiling.
- **Self-service QR support** – Deep linking support via `?id=CRC-...` for automatic scanning and verification.

---

## Architecture

```text
[ Browser / QR Code Scanner ]
              │
              ▼
    [ Vercel Static Hosting ]
  ├── index.html, privacy.html, terms.html
  ├── style.css & script.js
  └── Assets (logos, favicon, background)
              │
      ┌───────┴────────────────────────┐
      │ (POST /api/verify)             │ (GET /api/keep-alive via Vercel Cron)
      ▼                                ▼
[ /api/verify ]                 [ /api/keep-alive ]
  ├── CORS & Input Validation     ├── Timing-safe CRON_SECRET auth
  ├── IP Rate Limiting (RPC)      └── Database ping query
  ├── Async PBKDF2 Hashing
  └── Database Query
              │                                │
              └───────────────┬────────────────┘
                              ▼
                  [ Supabase PostgreSQL ]
                    ├── certificates table (PBKDF2 hash PK)
                    └── increment_rate_limit (RPC Function)
```

---

## How It Works

1. **User Input:** A user enters a certificate ID (format: `CRC-YYYYMMDD-XXX` with 3–5 suffix characters) or opens the page via a QR code with `?id=CRC-...`.
2. **API Verification Request:** The frontend issues a `POST` request to `/api/verify` containing the certificate ID.
3. **Serverless Execution:**
   - Validates the request origin against allowed CORS origins.
   - Validates input structure against format regex `/^CRC-\d{8}-[A-Z0-9]{3,5}$/`.
   - Calls the `increment_rate_limit` RPC function on Supabase to enforce IP rate limits (10 req/60s).
   - Generates a non-blocking **PBKDF2-SHA-256** hash (100,000 iterations + secret salt).
   - Queries the **Supabase `certificates` table** for a record matching the generated hash.
4. **Display:** The frontend securely renders the verified certificate details (name, programme, issue date, status) or displays a "not found" state.
5. **Database Keep-Alive:** Vercel Cron triggers `/api/keep-alive` once daily (`0 0 * * *`) with a timing-safe bearer token check to keep the database active and prevent free-tier pauses.

---

## Usage

- **Manual Entry:** Navigate to the homepage, enter a Certificate ID (e.g., `CRC-20250812-ABC` or `CRC-20250802-4M2`), and click **Verify**.
- **QR Scan Deep Link:** Scan a QR code that directly links to the verification page with query parameters:
  ```
  https://verification-dmu.vercel.app/?id=CRC-20250802-4M2
  ```

---

## Tech Stack (Free Tier)

| Layer               | Technology                        | Details / Free Tier Capacity                                |
|---------------------|-----------------------------------|-------------------------------------------------------------|
| **Hosting & API**   | [Vercel](https://vercel.com)      | Serverless functions, Edge network, Cron jobs, Clean URLs   |
| **Database & Auth** | [Supabase](https://supabase.com)  | PostgreSQL database, RPC rate limiting, Row-level security  |
| **Frontend**        | Vanilla (HTML5, CSS3, ES6 JS)     | Zero runtime UI frameworks, fast and lightweight            |
| **Dependencies**    | `@supabase/supabase-js`           | Only single runtime production dependency                   |

---

## Project Structure

```text
.
├── api/
│   ├── keep-alive.js      # Authenticated cron endpoint to prevent database idling
│   └── verify.js          # Core verification & rate-limiting serverless function
├── index.html             # Main certificate verification interface
├── privacy.html           # Privacy policy page
├── terms.html             # Terms of service page
├── style.css              # Global styles, variables, dark theme UI, and layout
├── script.js              # Client-side verification controller, deep linking, & DOM rendering
├── vercel.json            # Vercel cron configuration, clean URLs, and security headers
├── package.json           # Node.js dependencies (@supabase/supabase-js)
├── sitemap.xml            # Search engine sitemap
├── fav_crc.png            # CR&PC website favicon
├── logo_w.png             # CR&PC logo (white / light-on-dark)
├── logo_b.png             # CR&PC logo (dark)
├── background.png         # Subtle texture background asset
└── README.md              # Project documentation
```

---

## Database Schema & RPC

### `certificates` Table

| Column       | Type        | Description                                                  |
|--------------|-------------|--------------------------------------------------------------|
| `id`         | `TEXT` (PK) | PBKDF2-SHA-256 derived hash (hex) of the Certificate ID      |
| `name`       | `TEXT`      | Student / Candidate Full Name                                |
| `programme`  | `TEXT`      | Training or internship programme                             |
| `issued_on`  | `TEXT`      | Issue date (e.g., `YYYY-MM-DD` or ISO string)                |
| `status`     | `TEXT`      | Verification status (e.g. `Verified`)                        |

### `increment_rate_limit` RPC Function (PostgreSQL)

Rate limiting is handled directly in PostgreSQL to ensure atomic counter increments and window expiration per client IP address.

---

## Environment Variables

Configure the following environment variables in your Vercel project settings or `.env.local`:

| Variable Name        | Required | Description                                                         |
|----------------------|----------|---------------------------------------------------------------------|
| `SUPABASE_URL`       | Yes      | Your Supabase project URL (`https://xyz.supabase.co`)               |
| `SUPABASE_ANON_KEY`  | Yes      | Your Supabase anon / public API key                                |
| `SECRET_SALT`        | Yes      | Secret salt for PBKDF2 hashing (minimum 32 characters)             |
| `ALLOWED_ORIGINS`    | No       | Comma-separated list of allowed CORS origins                        |
| `CRON_SECRET`        | Yes      | Shared secret token for authenticating Vercel Cron keep-alive pings |

---

## Security

- **Strict Security Headers:** `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and `Permissions-Policy` are enforced globally via `vercel.json`.
- **Zero-Knowledge Data Storage:** Plain-text certificate IDs never touch the database or server logs; all lookups are performed using 100,000-iteration PBKDF2-SHA-256 hashes.
- **Timing-Safe Cron Authentication:** The `/api/keep-alive` endpoint uses `crypto.timingSafeEqual` to prevent timing attacks on authorization headers.
- **No Inline Event Handlers:** Client scripts attach handlers via `addEventListener` to maintain full CSP compatibility (`'unsafe-inline'` avoided in script execution).
- **Asynchronous Hashing:** Password-based key derivation (PBKDF2) runs via Node.js's asynchronous libuv pool without blocking event loop concurrency.
- **No Client Secrets:** All database keys and cryptographic salts are kept exclusively in serverless environment variables.

---

## Contributing

This portal is maintained by the Interns of Campus Recruitment & Placement Cell, Dhanamanjuri University.  
To contribute or report issues, please contact: [crcdmu.manipur@gmail.com](mailto:crcdmu.manipur@gmail.com)

---

## License

This project is proprietary and built specifically for the **Campus Recruitment & Placement Cell, Dhanamanjuri University**.
