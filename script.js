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

        if (result.success) {
          sessionStorage.setItem('verifiedCandidate', JSON.stringify(result.data));
          // Pass the ID in the URL so copy-pasted links work for 3rd parties
          window.location.href = `/verify.html?id=${encodeURIComponent(candidateId)}`;
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

  let studentData = JSON.parse(sessionStorage.getItem('verifiedCandidate'));

  // Fallback: If someone arrived via a direct shared URL and skipped index.html, fetch it now
  if (!studentData && requestedCertId) {
    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certificateId: requestedCertId })
      });
      const payload = await res.json();
      if (payload.success) studentData = payload.data;
    } catch (e) {
      console.error(e);
    }
  }

  if (studentData) {
    resultContainer.innerHTML = `
      <div class="verified-badge">✓ OFFICIAL RECORD VERIFIED</div>
      <div class="details-grid">
        <div class="detail-item">
          <span>Candidate Name</span>
          <strong>${studentData.name}</strong>
        </div>
        <div class="detail-item">
          <span>Programme</span>
          <strong>${studentData.programme}</strong>
        </div>
        <div class="detail-item">
          <span>Issued Date</span>
          <strong>${studentData.issuedOn}</strong>
        </div>
        <div class="detail-item">
          <span>Archive Status</span>
          <strong class="status-valid">${studentData.status}</strong>
        </div>
      </div>
      <p class="footer-note" style="margin-top:15px;">Dhanamanjuri University • CR&PC Archives</p>
      <a href="/" class="btn-secondary" style="display:inline-block; margin-top:10px;">Verify Another ID</a>
    `;
  } else {
    resultContainer.innerHTML = `
      <div class="invalid-badge">✕ RECORD NOT FOUND</div>
      <p style="color: #7f8c8d; margin-bottom: 20px;">No authentic certificate matching ID <strong>"${requestedCertId || 'Blank'}"</strong> exists in the repository.</p>
      <a href="/" class="btn" style="width: auto; padding: 10px 25px;">Back to Search</a>
    `;
  }
}
