document.addEventListener('DOMContentLoaded', () => {
  const verifyForm = document.getElementById('verify-form');
  const resultContainer = document.getElementById('resultContainer');

  // ==========================================
  // PAGE 1: INDEX.HTML (Handle Form Input)
  // ==========================================
  if (verifyForm) {
    verifyForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      
      const inputField = document.getElementById('cert-id-input');
      const statusDisplay = document.getElementById('status-message');
      const candidateId = inputField.value.trim();

      if (!candidateId) return;

      statusDisplay.style.color = '#111827';
      statusDisplay.innerText = 'Querying University Secure Records...';

      try {
        const response = await fetch('/api/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ certificateId: candidateId })
        });

        const result = await response.json();

        // PATCHED: Completely removed sessionStorage.setItem().
        // We solely redirect to verify.html and let the server authorize the display.
        if (result.success) {
          window.location.href = `/verify.html?id=${encodeURIComponent(candidateId.trim().toUpperCase())}`;
        } else {
          statusDisplay.style.color = '#990000'; // DMU Red
          statusDisplay.innerText = result.message;
        }
      } catch (err) {
        statusDisplay.style.color = '#990000';
        statusDisplay.innerText = 'Unable to connect to verification server. Please try again.';
      }
    });
  }

  // ==========================================
  // PAGE 2: VERIFY.HTML (Render the Certificate)
  // ==========================================
  if (resultContainer) {
    renderVerification();
  }
});

async function renderVerification() {
  const resultContainer = document.getElementById('resultContainer');
  const params = new URLSearchParams(window.location.search);
  const requestedCertId = params.get('id');

  if (!requestedCertId) {
    renderRecordNotFound('Blank');
    return;
  }

  try {
    // PATCHED: Mandatory live server check. Client storage is never trusted.
    const res = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ certificateId: requestedCertId })
    });
    const payload = await res.json();

    if (payload.success && payload.data) {
      const studentData = payload.data;

      // Stamp cryptographic metadata for IT auditors
      resultContainer.setAttribute('data-cryptographic-checksum', studentData.checksum);
      resultContainer.setAttribute('data-verification-timestamp', new Date().toISOString());

      // Render static HTML skeleton with empty ID hooks
      resultContainer.innerHTML = `
        <div class="verified-badge">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          Official Record Verified
        </div>
        <div class="details-grid">
          <div class="detail-item">
            <span>Candidate Name</span>
            <strong id="safe-name"></strong>
          </div>
          <div class="detail-item">
            <span>Programme</span>
            <strong id="safe-prog"></strong>
          </div>
          <div class="detail-item">
            <span>Issued Date</span>
            <strong id="safe-issued"></strong>
          </div>
          <div class="detail-item">
            <span>Archive Status</span>
            <strong id="safe-status" class="status-valid"></strong>
          </div>
        </div>
        <p class="footer-note" style="margin-top:15px;">Dhanamanjuri University • CR&PC Archives</p>
        <a href="/" class="btn-secondary" style="display:inline-block; margin-top:10px;">Verify Another ID</a>
      `;

      // PATCHED (Vulnerability #2 XSS Mitigation): Use secure .textContent assignment
      document.getElementById('safe-name').textContent = studentData.name;
      document.getElementById('safe-prog').textContent = studentData.programme;
      document.getElementById('safe-issued').textContent = studentData.issuedOn;
      document.getElementById('safe-status').textContent = studentData.status;

    } else {
      renderRecordNotFound(requestedCertId);
    }
  } catch (e) {
    console.error("Verification Request Failed:", e);
    resultContainer.innerHTML = `
      <div style="color: #990000; font-weight: bold; margin-bottom: 15px;">Connection Error</div>
      <p style="color: #64748b; margin-bottom: 20px;">Could not connect to the secure university archives. Please verify your internet connection.</p>
      <a href="/" class="btn" style="width: auto; padding: 10px 25px;">Try Again</a>
    `;
  }
}

function renderRecordNotFound(displayId) {
  const resultContainer = document.getElementById('resultContainer');
  resultContainer.innerHTML = `
    <div style="color: #990000; font-weight: 800; font-size: 1.1rem; margin-bottom: 12px;" class="invalid-badge">✕ RECORD NOT FOUND</div>
    <p style="color: #64748b; margin-bottom: 20px;">No authentic certificate matching ID <strong id="safe-id-display"></strong> exists in the repository.</p>
    <a href="/" class="btn" style="width: auto; padding: 10px 25px;">Back to Search</a>
  `;
  document.getElementById('safe-id-display').textContent = displayId;
}
