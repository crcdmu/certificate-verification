
Certificate Verification System

A secure, serverless web application designed to verify the authenticity of certificates issued by the Dhanamanjuri University • CR&PC Archives. It provides a cryptographic, tamper-proof way to validate student certificates through manual ID entry or QR code scanning.

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
Database: JSON-based local storage (`database.json`) mapped via secure cryptographic checksums.


📂 Project Structure

```text
.
├── api/
│   ├── database.json   # Mock database storing student records mapped to hashed IDs
│   └── verify.js       # Vercel Serverless Function handling validation & security
├── .vscode/
│   └── settings.json   # Local dev environment settings (Live Server)
├── index.html          # Main frontend UI
├── script.js           # Frontend logic & API communication
├── style.css           # Institutional styling and print media queries
└── vercel.json         # Deployment config (Blocks direct access to the database)

```



🔐 Security Architecture

1. **Database Protection:** The raw `database.json` file is explicitly blocked from public access using routing rules in `vercel.json`.
2. **CORS Enforcement:** The API rejects requests that do not originate from allowed origins or lack a browser context.
3. **Data Sanitization:** Input certificate IDs are strictly validated against the regex pattern `^CRC-\d{8}-[A-Z0-9]{3,5}$`.
4. **Zero-Knowledge Storage:** The database only stores cryptographic checksums (hashes) of the certificate IDs, not the raw IDs themselves.


📝 Usage

* **Manual Entry:** Navigate to the homepage and enter a valid Certificate ID (e.g., `CRC-20250812-ABC`).
* **QR Scan:** Append the ID directly to the URL: `https://verification-dmu.vercel.app/index.html?id=CRC-20250802-4M2`.

---

📜 License

This project is proprietary and built specifically for Dhanamanjuri University • CR&PC Archives.
