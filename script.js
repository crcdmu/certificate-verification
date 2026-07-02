// Disable browser scroll restoration
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}
window.scrollTo(0, 0);

document.addEventListener('DOMContentLoaded', () => {
  const verifyForm = document.getElementById('verify-form');
  const searchSection = document.getElementById('search-section');
  const resultContainer = document.getElementById('resultContainer');
  const statusDisplay = document.getElementById('status-message');

  // Wire up the static "Verify Another ID" button (CSP-safe, no inline onclick)
  const verifyAnotherBtn = document.getElementById('verify-another-btn');
  if (verifyAnotherBtn) {
    verifyAnotherBtn.addEventListener('click', resetSearch);
  }

  // URL Parameter Check for QR Codes
  const urlParams = new URLSearchParams(window.location.search);
  const scannedId = urlParams.get('id');

  if (scannedId) {
    const inputField = document.getElementById('cert-id-input');
    if(inputField) inputField.value = scannedId;
    runVerification(scannedId);
  }

  // Manual Form Submission
  if (verifyForm) {
    verifyForm.addEventListener('submit', (event) => {
      event.preventDefault(); 
      const inputField = document.getElementById('cert-id-input');
      const candidateId = inputField.value.trim();
      if (!candidateId) return;
      
      runVerification(candidateId);
    });
  }

  // Reusable Verification Logic
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
        renderVerificationSuccess(result.data);
      } else {
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

// Smooth Scroll Animation
function smoothScrollTo(targetPosition, duration) {
  const startPosition = window.scrollY;
  const distance = targetPosition - startPosition;
  let startTime = null;

  function animation(currentTime) {
    if (startTime === null) startTime = currentTime;
    const timeElapsed = currentTime - startTime;
    const progress = Math.min(timeElapsed / duration, 1);
    
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

// Mobile Auto-Scroll (Landing Page Only)
window.addEventListener('load', () => {
  const urlParams = new URLSearchParams(window.location.search);
  
  if (!urlParams.get('id') && window.innerWidth <= 1024) {
    setTimeout(() => {
      const formCard = document.querySelector('.form-side');
      
      if (formCard && formCard.style.display !== 'none') {
        const yOffset = formCard.getBoundingClientRect().top + window.scrollY - 20;
        smoothScrollTo(yOffset, 1500);
      }
    }, 800); 
  }
});

function renderVerificationSuccess(studentData) {
  document.getElementById('landing-view').style.display = 'none';
  const verifiedView = document.getElementById('verified-view');
  verifiedView.style.display = 'flex'; 
  
  verifiedView.setAttribute('data-verification-timestamp', new Date().toISOString());

  document.getElementById('vd-name').textContent = studentData.name;
  document.getElementById('vd-prog').textContent = studentData.programme;
  document.getElementById('vd-date').textContent = studentData.issuedOn;
  document.getElementById('vd-status').textContent = studentData.status;

  if (window.innerWidth <= 1024) {
    setTimeout(() => {
      const detailsPanel = document.querySelector('.details-panel');
      if (detailsPanel) {
        const yOffset = detailsPanel.getBoundingClientRect().top + window.scrollY - 20;
        smoothScrollTo(yOffset, 1500);
      }
    }, 400);
  }
}

function renderRecordNotFound(displayId, customMessage) {
  const resultContainer = document.getElementById('resultContainer');
  const isBlank = !displayId || displayId === 'Blank';

  resultContainer.innerHTML = `
    <div class="invalid-badge">✕ RECORD NOT FOUND</div>
    <p id="error-msg-container" style="color: var(--text-muted); margin-bottom: 20px; text-align: center; font-size: 0.95rem;"></p>
    <button id="back-to-search-btn" class="btn-primary" style="background: #f1f5f9; color: var(--brand-navy);">Back to Search</button>
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

  // Attach listener to the dynamically created button (CSP-safe)
  document.getElementById('back-to-search-btn').addEventListener('click', resetSearch);
}

function resetSearch() {
  window.location.href = window.location.pathname;
}

// Mailto fallback: always opens Gmail compose
// while also trying the default email client

document.querySelectorAll('a.mailto-fallback').forEach(link => {
  link.addEventListener('click', function(e) {
    e.preventDefault();
    const href = this.getAttribute('href');
    if (!href || !href.startsWith('mailto:')) return;

    const mailto = href.substring(7); // remove 'mailto:'
    const [emailPart, queryPart] = mailto.split('?');
    const email = emailPart;
    let subject = '';

    if (queryPart) {
      const params = new URLSearchParams(queryPart);
      subject = params.get('subject') || 'Contact from Verification Portal';
    }

    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(subject)}`;
    window.open(gmailUrl, '_blank');               // always opens Gmail
    window.location.href = href;                    // also triggers default mail app
  });
});