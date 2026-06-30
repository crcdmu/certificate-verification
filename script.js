// This disables the browser's memory of where you were scrolled,
// ensuring the animation starts from the top every single time.
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}
window.scrollTo(0, 0); 


document.addEventListener('DOMContentLoaded', () => {
  const verifyForm = document.getElementById('verify-form');
  const searchSection = document.getElementById('search-section');
  const resultContainer = document.getElementById('resultContainer');
  const statusDisplay = document.getElementById('status-message');

  // --- URL Parameter Check for QR Codes ---
  const urlParams = new URLSearchParams(window.location.search);
  const scannedId = urlParams.get('id');

  if (scannedId) {
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

      if (result.success && result.data) {
        // Success: Switch to the fullscreen verified view
        renderVerificationSuccess(result.data);
      } else {
        // Error: Stay on landing view, but swap the card content to show the error
        document.getElementById('search-section').style.display = 'none';
        document.getElementById('resultContainer').style.display = 'block';
        renderRecordNotFound(candidateId, result.message);
      }
    } catch (err) {
      console.error("Verification Request Failed:", err);
      statusDisplay.style.color = '#dc2626';
      statusDisplay.innerText = 'Unable to connect to verification server. Please try again.';
    }
  }
});


// --- CUSTOM SPEED ANIMATION FUNCTION ---
function smoothScrollTo(targetPosition, duration) {
  const startPosition = window.scrollY;
  const distance = targetPosition - startPosition;
  let startTime = null;

  function animation(currentTime) {
    if (startTime === null) startTime = currentTime;
    const timeElapsed = currentTime - startTime;
    const progress = Math.min(timeElapsed / duration, 1);
    
    // Easing function (Ease-in-out cubic) for a natural, gliding feel
    const easeInOutCubic = progress < 0.5 
        ? 4 * progress * progress * progress 
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

    window.scrollTo(0, startPosition + (distance * easeInOutCubic));

    if (timeElapsed < duration) {
      requestAnimationFrame(animation);
    }
  }

  requestAnimationFrame(animation);
}


// --- MOBILE AUTO-SCROLL (LANDING PAGE ONLY) ---
window.addEventListener('load', () => {
  const urlParams = new URLSearchParams(window.location.search);
  
  // Only trigger the landing page scroll if we are NOT loading a QR code
  if (!urlParams.get('id') && window.innerWidth <= 1024) {
    setTimeout(() => {
      const formCard = document.querySelector('.form-side');
      
      // Ensure the form side is actually visible before trying to scroll to it
      if (formCard && formCard.style.display !== 'none') {
        const yOffset = formCard.getBoundingClientRect().top + window.scrollY - 20;
        smoothScrollTo(yOffset, 1500); // 1.5 seconds smooth scroll
      }
    }, 800); 
  }
});


function renderVerificationSuccess(studentData) {
  // Hide Landing View, Show Verified View
  document.getElementById('landing-view').style.display = 'none';
  const verifiedView = document.getElementById('verified-view');
  verifiedView.style.display = 'flex'; 
  
  // Set metadata on the container
  verifiedView.setAttribute('data-cryptographic-checksum', studentData.checksum);
  verifiedView.setAttribute('data-verification-timestamp', new Date().toISOString());

  // Populate the new data card
  document.getElementById('vd-name').textContent = studentData.name;
  document.getElementById('vd-prog').textContent = studentData.programme;
  document.getElementById('vd-date').textContent = studentData.issuedOn;
  document.getElementById('vd-status').textContent = studentData.status;

  // --- MOBILE AUTO-SCROLL (VERIFIED VIEW) ---
  if (window.innerWidth <= 1024) {
    setTimeout(() => {
      const detailsPanel = document.querySelector('.details-panel');
      if (detailsPanel) {
        const yOffset = detailsPanel.getBoundingClientRect().top + window.scrollY - 20;
        smoothScrollTo(yOffset, 1500); // Matches the 1.5s landing page animation
      }
    }, 400); // Short delay to allow the DOM to render the new view first
  }
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
  // Refreshes the page and drops any '?id=' parameters from the URL
  // This acts as a hard reset, so resetting input values manually afterward is unnecessary.
  window.location.href = window.location.pathname;
};
