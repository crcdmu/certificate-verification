# CERTIFICATE VERIFICATION SYSTEM

A secure, serverless web application designed to verify the authenticity of certificates issued by the Campus Recruitment & Placement Cell, Dhanamanjuri University. 

🚀 Features
* **Cryptographic Verification**: Uses PBKDF2 (100,000 iterations) with a secret salt to securely hash certificate IDs before checking against the private database.
* **QR Code Ready**: Automatically reads and validates IDs passed via URL parameters (`?id=CRC-...`).
* **Serverless Architecture**: Built to run on Vercel as a serverless Node.js API.
* **Distributed Rate Limiting & Anti-Abuse**: Uses **Vercel KV (Redis)** for true distributed rate limiting to stop brute-force enumeration attacks across all deployed instances.
* **Indexed Lookups**: Uses KV to cache and index Google Sheet records for O(1) lightning-fast lookups, mitigating Google API bottlenecks.

🛠 Tech Stack
* Frontend: HTML5, CSS3, Vanilla JavaScript (Zero dependencies)
* Backend: Node.js (Vercel Serverless)
* Database/Cache: Google Sheets API + `@vercel/kv` (Redis)



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

This project is proprietary and built specifically for Campus Recruitment & Placement Cell, Dhanamanjuri University.
