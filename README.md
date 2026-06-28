CERTIFICATE VERIFICATION SYSTEM
A temporary solution for certificate verification until DMU officially make one .
A secure, serverless web application designed to verify the authenticity of certificates issued by the Campus Recruitment & Placement Cell, Dhanamanjuri University. It provides a cryptographic, tamper-resistant way to validate student certificates through manual ID entry or QR code scanning.

🚀 Features

Cryptographic Verification: Uses PBKDF2 (100,000 iterations) with a secret salt to securely hash certificate IDs, preventing offline brute-force attacks and ensuring data integrity.
QR Code Ready: Automatically reads and validates certificate IDs passed via URL parameters (`?id=CRC-...`).
Serverless Architecture: Built to run on Vercel as a serverless Node.js API.
Rate Limiting & Anti-Abuse: In-memory rate limiting blocks enumeration attacks (max 10 requests per minute per IP).
Strict Security Headers: Implements Content-Security-Policy (CSP), Strict-Transport-Security (HSTS), X-Frame-Options, and X-Content-Type-Options.
Print-Optimized UI: Clean, institutional design that automatically strips UI elements when printing the verification proof.

🛠 Tech Stack

Frontend: HTML5, CSS3, Vanilla JavaScript (Zero dependencies)
Backend: Node.js (Vercel Serverless Functions)
Database Client: `google-spreadsheet` & `google-auth-library` (Connecting to Google Sheets)


📂 Project Structure

```text
.
├── api/
│   └── verify.js       # Vercel Serverless Function handling validation & security
├── .vscode/
│   └── settings.json   # Local dev environment settings (Live Server)
├── .gitignore          # Keeps private keys and local environment variables out of Git
├── index.html          # Main frontend verification UI
├── package.json        # Node.js backend dependencies
├── script.js           # Frontend logic & API communication
├── style.css           # Institutional styling and print media queries
└── vercel.json         # Serverless routing configuration

```



🔐 Security Architecture

Private Database Storage: The Google Sheet containing student records is kept strictly private. It is shared exclusively with a Google Cloud Service Account (Editor permission), ensuring zero public exposure.

Environment Variable Isolation: Private cryptographic keys are injected safely at runtime via Vercel's secure environment pipeline and are never exposed to the frontend or committed to GitHub.

CORS Enforcement: The API rejects requests that do not originate from allowed institutional origins or lack a valid browser context.

Input Sanitization: Incoming certificate IDs are strictly validated against the regex pattern ^CRC-\d{8}-[A-Z0-9]{3,5}$.

Zero-Knowledge Archives: The spreadsheet stores only PBKDF2 cryptographic checksums of the certificate IDs, preventing reverse-engineering of raw certificate numbers even if administrator access is compromised.


📝 Usage

Manual Entry: Navigate to the homepage and enter a valid Certificate ID (e.g., `CRC-20250812-ABC`).
QR Scan appends the ID directly to the URL:e.g. `https://verification-dmu.vercel.app/index.html?id=CRC-20250802-4M2`.



📜 License

This project is proprietary and built specifically for Dhanamanjuri University • CR&PC Archives.
