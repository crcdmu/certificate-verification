# Certificate Verification Portal – CR&PC, Dhanamanjuri University

Unofficial certificate verification portal for the **Campus Recruitment & Placement Cell (CR&PC)** of Dhanamanjuri University, Imphal, Manipur.  
Employers, recruiters and students can instantly verify the authenticity of certificate issued by CR&PC
> **Live URL:** [https://verification-dmu.vercel.app](https://verification-dmu.vercel.app)

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [How It Works](#how-it-works)
- [Tech Stack (Free Tier)](#tech-stack-free-tier)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [Security](#security)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **Instant verification** – Enter a certificate ID or scan a QR code to get the result in real‑time.
- **Zero‑knowledge architecture** – Certificate IDs are never stored in plain text; lookups use PBKDF2‑hashed keys.
- **Rate‑limited & abuse‑protected** – Atomic IP‑based rate limiting (10 requests/minute) and strict CORS prevent brute‑force attacks.
- **Secure by default** – CSP, HSTS, X‑Frame‑Options, and other security headers set globally via `vercel.json`.
- **Completely free to run** – Uses only services with generous free tiers (see [Tech Stack](#tech-stack-free-tier)).
- **Mobile‑first responsive design** – Works perfectly on desktops, tablets and phones.
- **No cookies, no tracking** – Privacy‑respecting; no analytics or user profiling.
- **Self‑service QR support** – Append `?id=CRC-...` to the URL for direct scanning.

---

## Architecture
```text
[Browser / QR Scanner]
        │
        ▼
[ Vercel Static Hosting ]
   ├── index.html
   ├── style.css
   └── script.js
        │ (POST /api/verify)
        ▼
[ Vercel Serverless Function ]
   ├── Input validation (regex)
   ├── PBKDF2 hash (async, non-blocking)
   ├── Cache check (Upstash Redis)
   ├── Database query (Turso SQLite)
   └── Response (JSON)
        │
        ├─ Cache: Upstash Redis (REST API)
        │     - Rate limiter counters
        │     - Verification result cache (TTL 1h)
        │
        └─ Database: Turso (libsql)
              - certificates table (id = hashed certificate ID)

```
---

## How It Works

1. A user enters a certificate ID (format: `CRC-YYYYMMDD-XXX`) or scans a QR code.
2. The frontend sends a `POST` request to `/api/verify` with the ID.
3. The serverless function:
   - Validates the input format and length.
   - Checks the IP‑based rate limiter (Upstash Redis, atomic `INCR`).
   - Hashes the certificate ID using **PBKDF2** (100,000 iterations, SHA‑256, with a secret salt).
   - Checks the **cache** (Upstash) for a previously verified result.
   - If not cached, queries the **Turso database** for a matching hash.
   - Caches the result for 1 hour and returns it as JSON.
4. The frontend displays either a verified certificate with student details or a “not found” message.

> The certificate ID format and the verification URL `/api/verify` are **fixed** and never change.

---
## Usage

Manual Entry: Navigate to the homepage and enter a valid Certificate ID (e.g., `CRC-20250812-ABC`).

QR Scan appends the ID directly to the URL:e.g. `https://verification-dmu.vercel.app/index.html?id=CRC-20250802-4M2`.

---
## Tech Stack (Free Tier)

| Layer          | Technology                           | Free Tier Limits                                           |
|----------------|--------------------------------------|------------------------------------------------------------|
| Hosting        | [Vercel](https://vercel.com)         | 100 GB‑hours, 1M function invocations/month                |
| Database       | [Turso](https://turso.tech)          | 9 GB storage, 1 billion row reads/month, 3 databases       |
| Cache / Rate   | [Upstash Redis](https://upstash.com) | 256 MB, 10,000 commands/day                                |
| Frontend       | Vanilla (HTML, CSS, JavaScript)      | –                                                          |
| Dependencies   | [`@libsql/client`](https://www.npmjs.com/package/@libsql/client) (only one runtime dependency)    |

---

## Project Structure

.
├── api/
│   └── verify.js          # Serverless function (POST /api/verify)
├── index.html             # Main verification page
├── privacy.html           # Privacy policy
├── terms.html             # Terms of use
├── style.css              # Global styles (imports Inter from Google Fonts)
├── script.js              # Frontend logic (form, QR scan, rendering)
├── vercel.json            # Clean URLs + global security headers
├── package.json           # Node.js metadata & dependency
├── logo.png               # CR&PC logo (you must provide this file)
└── README.md              # This file

----



## Database Schema

Single table `certificates`:

| Column     | Type    | Description                            |
|------------|---------|-------------------------------------------|
| `id`       | TEXT PK | PBKDF2‑SHA‑256 hash of the certificate ID |
| `name`     | TEXT    | Student / candidate name                  |
| `programme`| TEXT    | programme                                 |
| `issued_on`| TEXT    | Date of issue (ISO 8601)                  |
| `status`   | TEXT    | Verification status (e.g. “Verified”)     |

---


## Security

This portal is built with security first. Here are the key measures:

- **All security headers** are set globally in `vercel.json`.
- **No inline event handlers** – all event binding is done via `addEventListener` to comply with CSP.
- **Rate limiting** uses an atomic `INCR`‑first pattern with a defensive `DEL` fallback to prevent orphaned keys.
- **Async PBKDF2** – hashing runs in the libuv thread pool, never blocking the event loop.
- **CORS validation** restricts access to trusted origins; non‑browser clients are blocked by IP rate limiting.
- **Parameterised SQL queries** eliminate injection risk.
- **No secrets** in the client bundle – all sensitive logic runs server‑side.
- **Zero‑knowledge design** – plain‑text certificate IDs are never stored or logged.

> A full security audit was conducted on the final codebase (July 2026). No critical or high‑risk findings remain.


---

## Contributing

This portal is maintained by the Interns of Campus Recruitment & Placement Cell, DMU.  
To contribute or report issues, please contact: [crcdmu.manipur@gmail.com](mailto:crcdmu.manipur@gmail.com)

---

## License

This project is proprietary and built specifically for Campus Recruitment & Placement Cell, Dhanamanjuri University.

---
