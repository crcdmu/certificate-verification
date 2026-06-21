async function handleVerification(event) {
  event.preventDefault();
  
  const inputField = document.getElementById('cert-id-input');
  const statusDisplay = document.getElementById('status-message');
  const candidateId = inputField.value.trim();

  if (!candidateId) return;

  // Show a professional loading state
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
      // Save the safe, isolated data to sessionStorage so verify.html can render it instantly
      sessionStorage.setItem('verifiedCandidate', JSON.stringify(result.data));
      window.location.href = '/verify.html';
    } else {
      statusDisplay.style.color = '#af0808'; // DMU Red
      statusDisplay.innerText = result.message;
    }
  } catch (err) {
    statusDisplay.style.color = '#990000';
    statusDisplay.innerText = 'Unable to connect to verification server. Please try again.';
  }
}

// Hook this to your form submit button inside index.html
document.getElementById('verify-form').addEventListener('submit', handleVerification);