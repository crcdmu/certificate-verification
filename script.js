document.addEventListener('DOMContentLoaded', () => {
  const verifyForm = document.getElementById('verify-form');
  const searchSection = document.getElementById('search-section');
  const resultContainer = document.getElementById('resultContainer');
  const statusDisplay = document.getElementById('status-message');

  if (verifyForm) {
    verifyForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      
      const inputField = document.getElementById('cert-id-input');
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

        // FIX 3: Catch unhandled server crashes (e.g. 500 Bad Gateway) to prevent JSON parse errors
        if (!response.ok && response.status !== 400 && response.status !== 404 && response.status !== 429) {
          throw new Error(`Server returned HTTP ${response.status}`);
        }

        const result = await response.json();

        // FIX 2: Single Page Application logic (Hide search, show results)
        searchSection.style.display = 'none';
        resultContainer.style.display = 'block';

        if (result.success && result.data) {
          renderVerificationSuccess(result.data);
        } else {
          renderRecordNotFound(candidateId, result.message);
        }
      } catch (err) {
        console.error("Verification Request Failed:", err);
        statusDisplay.style.color = '#990000';
        statusDisplay.innerText = 'Unable to connect to verification server. Please try again.';
      }
    });
  }
});

function renderVerificationSuccess(studentData) {
  const resultContainer = document.getElementById('resultContainer');
  
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
    <button onclick="resetSearch()" class="btn-secondary" style="display:inline-block; margin-top:10px; background:none; border:none; cursor:pointer;">Verify Another ID</button>
  `;

  // Secure textContent assignment (XSS Mitigation)
  document.getElementById('safe-name').textContent = studentData.name;
  document.getElementById('safe-prog').textContent = studentData.programme;
  document.getElementById('safe-issued').textContent = studentData.issuedOn;
  document.getElementById('safe-status').textContent = studentData.status;
}

// FIX: Handle "Blank" or gracefully render Not Found screen SECURELY
function renderRecordNotFound(displayId, customMessage) {
  const resultContainer = document.getElementById('resultContainer');
  const isBlank = !displayId || displayId === 'Blank';

  // Render the static HTML skeleton safely
  resultContainer.innerHTML = `
    <div style="color: #990000; font-weight: 800; font-size: 1.1rem; margin-bottom: 12px;" class="invalid-badge">✕ RECORD NOT FOUND</div>
    <p id="error-msg-container" style="color: #64748b; margin-bottom: 20px;"></p>
    <button onclick="resetSearch()" class="btn" style="width: auto; padding: 10px 25px;">Back to Search</button>
  `;
  
  const msgContainer = document.getElementById('error-msg-container');

  // Safely inject text content (prevents XSS)
  if (customMessage) {
    msgContainer.textContent = customMessage;
  } else if (isBlank) {
    msgContainer.textContent = "No authentic certificate provided exists in the repository.";
  } else {
    // Build the "matching ID <id>" string safely
    msgContainer.textContent = "No authentic certificate matching ID ";
    const strongTag = document.createElement('strong');
    strongTag.textContent = displayId; // Automatically escapes HTML characters
    msgContainer.appendChild(strongTag);
    msgContainer.appendChild(document.createTextNode(" exists in the repository."));
  }
}
  
  if (!isBlank && !customMessage) {
    document.getElementById('safe-id-display').textContent = displayId;
  }
}

// Global utility to reset the SPA back to the initial search state
window.resetSearch = function() {
  document.getElementById('search-section').style.display = 'block';
  document.getElementById('resultContainer').style.display = 'none';
  document.getElementById('cert-id-input').value = '';
  document.getElementById('status-message').innerText = '';
};
