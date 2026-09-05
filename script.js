// Disable browser scroll restoration
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}
window.scrollTo(0, 0);

// Global reference to active verified certificate ID
let currentVerifiedId = '';

document.addEventListener('DOMContentLoaded', () => {
  const verifyForm = document.getElementById('verify-form');
  const statusDisplay = document.getElementById('status-message');

  // Guard: If this is not a verification page (e.g. privacy.html or terms.html), exit early
  if (!verifyForm) {
    return;
  }

  // Wire up the static "Verify Another ID" button (CSP-safe, no inline onclick)
  const verifyAnotherBtn = document.getElementById('verify-another-btn');
  if (verifyAnotherBtn) {
    verifyAnotherBtn.addEventListener('click', resetSearch);
  }

  // Feature 1: Copy Link
  const copyLinkBtn = document.getElementById('copy-link-btn');
  if (copyLinkBtn) {
    copyLinkBtn.addEventListener('click', () => {
      const shareUrl = `${window.location.origin}${window.location.pathname}?id=${encodeURIComponent(currentVerifiedId)}`;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareUrl)
          .then(() => showToast('Verification link copied to clipboard!'))
          .catch(() => fallbackCopy(shareUrl));
      } else {
        fallbackCopy(shareUrl);
      }
    });
  }

  // Feature 2: Print Record
  const printRecordBtn = document.getElementById('print-record-btn');
  if (printRecordBtn) {
    printRecordBtn.addEventListener('click', () => {
      window.print();
    });
  }

  // URL Parameter Check for QR Codes
  const urlParams = new URLSearchParams(window.location.search);
  const scannedId = urlParams.get('id');

  if (scannedId) {
    const cleanScanned = scannedId.trim().toUpperCase();
    const inputField = document.getElementById('cert-id-input');
    if (inputField) inputField.value = cleanScanned;
    runVerification(cleanScanned);
  }

  // Manual Form Submission
  verifyForm.addEventListener('submit', (event) => {
    event.preventDefault(); 
    const inputField = document.getElementById('cert-id-input');
    const candidateId = inputField ? inputField.value.trim().toUpperCase() : '';
    if (!candidateId) return;
    
    runVerification(candidateId);
  });

  // Reusable Verification Logic
  async function runVerification(candidateId) {
    const cleanId = candidateId.trim().toUpperCase();
    currentVerifiedId = cleanId;

    const verifyBtn = document.getElementById('verify-btn');
    const btnText = document.getElementById('btn-text');

    if (verifyBtn) verifyBtn.disabled = true;
    if (btnText) btnText.textContent = 'Querying University Records...';
    if (statusDisplay) statusDisplay.textContent = '';

    try {
      const response = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certificateId: cleanId })
      });

      if (!response.ok && response.status !== 400 && response.status !== 404 && response.status !== 429) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const result = await response.json();

      if (result.success && result.data) {
        renderVerificationSuccess(result.data, cleanId);
      } else {
        const searchSection = document.getElementById('search-section');
        const resultContainer = document.getElementById('resultContainer');
        if (searchSection) searchSection.style.display = 'none';
        if (resultContainer) resultContainer.style.display = 'block';
        renderRecordNotFound(cleanId, result.message);
      }
    } catch (err) {
      console.error("Verification Request Failed:", err);
      if (statusDisplay) {
        statusDisplay.style.color = '#dc2626';
        statusDisplay.innerText = 'Unable to connect to verification server. Please try again.';
      }
    } finally {
      if (verifyBtn) verifyBtn.disabled = false;
      if (btnText) btnText.textContent = 'Verify Certificate';
    }
  }

  // Toast notification helper
  function showToast(message) {
    let toast = document.getElementById('toast-notice');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast-notice';
      toast.className = 'toast-notice';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }

  function fallbackCopy(text) {
    const tempInput = document.createElement('input');
    tempInput.value = text;
    document.body.appendChild(tempInput);
    tempInput.select();
    try {
      document.execCommand('copy');
      showToast('Verification link copied to clipboard!');
    } catch (e) {
      showToast('Could not copy link automatically.');
    }
    document.body.removeChild(tempInput);
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

function renderVerificationSuccess(studentData, certId) {
  if (certId) currentVerifiedId = certId.trim().toUpperCase();

  const isStatusValid = (studentData.status || '').trim().toLowerCase() === 'valid';

  document.body.classList.add('verified-view-active');
  if (!isStatusValid) {
    document.body.classList.add('status-invalid');
  } else {
    document.body.classList.remove('status-invalid');
  }

  const landingView = document.getElementById('landing-view');
  if (landingView) landingView.style.display = 'none';

  const verifiedView = document.getElementById('verified-view');
  if (verifiedView) {
    verifiedView.style.display = 'flex';
    verifiedView.setAttribute('data-verification-timestamp', new Date().toISOString());
  }

  // Update Status Heading & Description based on authenticity & revocation
  const headingElem = document.querySelector('.status-heading');
  const descElem = document.querySelector('.status-description');
  const badgeTextElem = document.querySelector('.database-badge span');

  if (headingElem) {
    headingElem.textContent = isStatusValid ? 'Official Record Verified' : `Certificate ${studentData.status || 'Revoked'}`;
  }
  if (descElem) {
    descElem.innerHTML = isStatusValid
      ? 'This certificate is authentic and has been<br> issued by Dhanamanjuri University.'
      : `This certificate record exists in the university database but is currently flagged as <strong>${(studentData.status || 'REVOKED').toUpperCase()}</strong>.`;
  }
  if (badgeTextElem) {
    badgeTextElem.textContent = isStatusValid
      ? 'This is an official record from the university database.'
      : `Status: ${studentData.status || 'Revoked'} — Record requires institutional review.`;
  }

  const idElem = document.getElementById('vd-cert-id');
  if (idElem) idElem.textContent = currentVerifiedId || '';

  const nameElem = document.getElementById('vd-name');
  if (nameElem) nameElem.textContent = studentData.name || '';

  const progElem = document.getElementById('vd-prog');
  if (progElem) progElem.textContent = studentData.programme || '';

  const dateElem = document.getElementById('vd-date');
  if (dateElem) dateElem.textContent = studentData.issuedOn || '';

  const statusElem = document.getElementById('vd-status');
  if (statusElem) {
    statusElem.textContent = studentData.status || '';
    if (!isStatusValid) {
      statusElem.classList.remove('valid-status');
      statusElem.classList.add('invalid-status');
    } else {
      statusElem.classList.remove('invalid-status');
      statusElem.classList.add('valid-status');
    }
  }

  const printTimeElem = document.getElementById('vd-print-time');
  if (printTimeElem) {
    const now = new Date();
    printTimeElem.textContent = now.toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // Mobile: Smooth scroll to results
  if (window.innerWidth <= 1024) {
    setTimeout(() => {
      const detailsPanel = document.querySelector('.details-panel');
      if (detailsPanel) {
        const yOffset = detailsPanel.getBoundingClientRect().top + window.scrollY - 20;
        smoothScrollTo(yOffset, 1200);
      }
    }, 300);
  }
}

// Feature 3: Record Not Found
function renderRecordNotFound(displayId, customMessage) {
  const resultContainer = document.getElementById('resultContainer');
  const isBlank = !displayId || displayId === 'Blank';

  resultContainer.innerHTML = `
    <div class="not-found-card">
      <div class="not-found-icon-box">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
      </div>
      <div class="not-found-title">RECORD NOT FOUND</div>
      <p class="not-found-desc" id="error-msg-container"></p>
      <div class="format-reminder">
        <strong>Expected Format:</strong> <code>CRC-YYYYMMDD-XXX</code><br>
        Example: <code>CRC-20250812-ABC</code> or scan the QR code on the certificate.
      </div>
      <button id="back-to-search-btn" class="btn-primary" style="background: #f1f5f9; color: var(--brand-navy); border: none;">
        Back to Search
      </button>
    </div>
  `;
  
  const msgContainer = document.getElementById('error-msg-container');

  if (customMessage && customMessage !== 'Record not found.') {
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
  document.getElementById('back-to-search-btn').addEventListener('click', () => {
    if (window.location.search) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    resultContainer.style.display = 'none';
    const searchSection = document.getElementById('search-section');
    if (searchSection) searchSection.style.display = 'block';
    const inputField = document.getElementById('cert-id-input');
    if (inputField) {
      inputField.focus();
      inputField.select();
    }
  });
}

function resetSearch() {
  if (window.location.search) {
    window.history.replaceState({}, document.title, window.location.pathname);
  }
  document.body.classList.remove('verified-view-active', 'status-invalid');
  
  const verifiedView = document.getElementById('verified-view');
  const landingView = document.getElementById('landing-view');
  const searchSection = document.getElementById('search-section');
  const resultContainer = document.getElementById('resultContainer');
  const statusDisplay = document.getElementById('status-message');

  if (verifiedView) verifiedView.style.display = 'none';
  if (landingView) landingView.style.display = 'grid';
  if (searchSection) searchSection.style.display = 'block';
  if (resultContainer) resultContainer.style.display = 'none';
  if (statusDisplay) statusDisplay.textContent = '';

  const inputField = document.getElementById('cert-id-input');
  if (inputField) {
    inputField.value = '';
    inputField.focus();
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Mailto logic: opens default mail app on mobile, Gmail in a new tab on desktop
document.querySelectorAll('a.mailto-fallback').forEach(link => {
  link.addEventListener('click', function(e) {
    e.preventDefault();
    const href = this.getAttribute('href');
    if (!href || !href.startsWith('mailto:')) return;

    const mailto = href.substring(7);
    const [emailPart, queryPart] = mailto.split('?');
    const email = emailPart;
    let subject = '';

    if (queryPart) {
      const params = new URLSearchParams(queryPart);
      subject = params.get('subject') || 'Contact from Verification Portal';
    }

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile) {
      window.location.href = href;
    } else {
      const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(subject)}`;
      window.open(gmailUrl, '_blank', 'noopener,noreferrer');
    }
  });
});
