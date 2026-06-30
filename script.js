document.addEventListener('DOMContentLoaded', () => {
  const verifyForm = document.getElementById('verify-form');
  const searchSection = document.getElementById('search-section');
  const resultContainer = document.getElementById('resultContainer');
  const statusDisplay = document.getElementById('status-message');

  // --- URL Parameter Check for QR Codes ---
  const urlParams = new URLSearchParams(window.location.search);
  const scannedId = urlParams.get('id');

  if (scannedId) {
    // If a QR code was scanned, fill the input and run the check automatically
    const inputField = document.getElementById('cert-id-input');
    if(inputField) inputField.value = scannedId;
    runVerification(scannedId);
  }

  // --- Manual Form Submission ---
  if (verifyForm) {
    verifyForm.addEventListener('submit', (event) => {
      event.preventDefault(); 
      const inputField = document.getElementById('cert-id-input');
      const candidateId = inputField.value.trim();
      if (!candidateId) return;
      
      runVerification(candidateId);
    });
  }

  // --- Reusable Verification Logic ---
  async function runVerification(candidateId) {
    statusDisplay.style.color = '#111827';
    statusDisplay.innerText = 'Querying University Secure Records...';

    try {
      const response = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certificateId: candidateId })
      });

      if (!response.ok && response.status !== 400 && response.status !== 404 && response.status !== 429) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const result = await response.json();

      searchSection.style.display = 'none';
      resultContainer.style.display = 'block';

      if (result.success && result.data) {
        renderVerificationSuccess(result.data);
      } else {
        renderRecordNotFound(candidateId, result.message);
      }
    } catch (err) {
      console.error("Verification Request Failed:", err);
      statusDisplay.style.color = '#dc2626';
      statusDisplay.innerText = 'Unable to connect to verification server. Please try again.';
    }
  }
});

// --- NEW: ROBUST MOBILE AUTO-SCROLL ---
// Using 'load' ensures all CSS and layouts are fully painted before measuring
window.addEventListener('load', () => {
  if (window.innerWidth <= 1024) {
    setTimeout(() => {
      const formCard = document.querySelector('.form-side');
      
      if (formCard) {
        // Calculate the exact pixel position of the form, minus a 20px padding buffer for the top nav
        const yOffset = formCard.getBoundingClientRect().top + window.scrollY - 20;
        
        window.scrollTo({
          top: yOffset,
          behavior: 'smooth'
        });
      }
    }, 800); // 800ms delay to let the user see the top branding first
  }
});


function renderVerificationSuccess(studentData) {
  const resultContainer = document.getElementById('resultContainer');
  
  resultContainer.setAttribute('data-cryptographic-checksum', studentData.checksum);
  resultContainer.setAttribute('data-verification-timestamp', new Date().toISOString());

  resultContainer.innerHTML = `
    <div class="verified-badge">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
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
        <strong id="safe-status" style="color: var(--success-green);"></strong>
      </div>
    </div>
    <button onclick="resetSearch()" class="btn-primary" style="margin-top: 1rem; background: #f1f5f9; color: var(--brand-navy);">Verify Another ID</button>
  `;

  document.getElementById('safe-name').textContent = studentData.name;
  document.getElementById('safe-prog').textContent = studentData.programme;
  document.getElementById('safe-issued').textContent = studentData.issuedOn;
  document.getElementById('safe-status').textContent = studentData.status;
}

function renderRecordNotFound(displayId, customMessage) {
  const resultContainer = document.getElementById('resultContainer');
  const isBlank = !displayId || displayId === 'Blank';

  resultContainer.innerHTML = `
    <div class="invalid-badge">✕ RECORD NOT FOUND</div>
    <p id="error-msg-container" style="color: var(--text-muted); margin-bottom: 20px; text-align: center; font-size: 0.95rem;"></p>
    <button onclick="resetSearch()" class="btn-primary" style="background: #f1f5f9; color: var(--brand-navy);">Back to Search</button>
  `;
  
  const msgContainer = document.getElementById('error-msg-container');

  if (customMessage) {
    msgContainer.textContent = customMessage;
  } else if (isBlank) {
    msgContainer.textContent = "No authentic certificate provided exists in the repository.";
  } else {
    msgContainer.textContent = "No authentic certificate matching ID ";
    const strongTag = document.createElement('strong');
    strongTag.textContent = displayId; 
    msgContainer.appendChild(strongTag);
    msgContainer.appendChild(document.createTextNode(" exists in the repository."));
  }
}

window.resetSearch = function() {
  document.getElementById('search-section').style.display = 'block';
  document.getElementById('resultContainer').style.display = 'none';
  document.getElementById('cert-id-input').value = '';
  document.getElementById('status-message').innerText = '';
};
