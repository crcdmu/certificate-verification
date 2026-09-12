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

  // WebGL Fluid Glass & Noise Shader Transition
  const initShaderTransition = (canvas) => {
    if (!canvas) return null;

    let gl;
    try {
      gl = canvas.getContext('webgl', { alpha: true, antialias: true }) ||
           canvas.getContext('experimental-webgl', { alpha: true, antialias: true });
    } catch (e) {
      return null;
    }

    if (!gl) return null;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener('resize', resize);

    const vsSource = `
      attribute vec2 position;
      varying vec2 vUv;
      void main() {
        vUv = (position + 1.0) * 0.5;
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;

    const fsSource = `
      #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
      #else
      precision mediump float;
      #endif

      uniform vec2 u_resolution;
      uniform float u_progress;
      uniform float u_time;
      varying vec2 vUv;

      vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

      float snoise(vec2 v) {
        const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
        vec2 i  = floor(v + dot(v, C.yy) );
        vec2 x0 = v -   i + dot(i, C.xx);
        vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod289(i);
        vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
        vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
        m = m*m ; m = m*m ;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x + 0.5);
        vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
        vec3 g;
        g.x  = a0.x  * x0.x  + h.x  * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
        for (int i = 0; i < 3; ++i) {
          v += a * snoise(p);
          p = rot * p * 2.1 + vec2(0.12, 0.22);
          a *= 0.5;
        }
        return v;
      }

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
      }

      void main() {
        vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);
        float dist = length(uv);

        vec2 fluidP = uv * 3.4;
        float n1 = fbm(fluidP + vec2(u_time * 0.35, -u_time * 0.25));
        float n2 = fbm(fluidP * 1.6 + vec2(n1 * 1.2, -n1 * 0.8));
        float fluidDistort = n1 * 0.65 + n2 * 0.35;

        float maxRadius = 1.65;
        float currentRadius = u_progress * maxRadius;
        // Modulate edge distortion so it blossoms organically without creating an aperture at t=0
        float edgeMod = (fluidDistort - 0.5) * 0.24 * smoothstep(0.02, 0.22, u_progress);
        float delta = dist - currentRadius + edgeMod;

        float grain = (hash(gl_FragCoord.xy + fract(u_time)) - 0.5) * 0.035;

        float rEdge = smoothstep(-0.06, 0.02, delta - 0.015);
        float gEdge = smoothstep(-0.06, 0.02, delta);
        float bEdge = smoothstep(-0.06, 0.02, delta + 0.015);

        float caustic = exp(-abs(delta) * 35.0) * 0.45;
        float alpha = smoothstep(-0.04, 0.02, delta);

        vec3 baseColor = vec3(1.0) + grain;
        vec3 chromaticColor = vec3(rEdge, gEdge, bEdge);

        vec3 finalColor = mix(vec3(0.96, 0.98, 1.0), baseColor, alpha) + vec3(caustic);
        finalColor += (vec3(1.0) - chromaticColor) * 0.22 * (1.0 - alpha) * smoothstep(0.0, 0.15, currentRadius);

        float finalAlpha = clamp(alpha + caustic * 0.7, 0.0, 1.0);
        finalAlpha *= smoothstep(1.0, 0.88, u_progress);

        gl_FragColor = vec4(finalColor, finalAlpha);
      }
    `;

    const createShader = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vs = createShader(gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return null;

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const posAttr = gl.getAttribLocation(program, 'position');
    const resLoc = gl.getUniformLocation(program, 'u_resolution');
    const progLoc = gl.getUniformLocation(program, 'u_progress');
    const timeLoc = gl.getUniformLocation(program, 'u_time');

    gl.enableVertexAttribArray(posAttr);
    gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

    // Pre-render initial frame at t=0 so canvas is already solid white before transition starts
    gl.useProgram(program);
    gl.uniform2f(resLoc, canvas.width, canvas.height);
    gl.uniform1f(progLoc, 0.0);
    gl.uniform1f(timeLoc, 0.0);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    return {
      start(duration = 750, callback) {
        gl.useProgram(program);
        const startTime = performance.now();
        let animationFrameId;

        const render = (now) => {
          const elapsed = now - startTime;
          const t = Math.min(elapsed / duration, 1.0);
          // High-precision smooth quintic ease-out
          const progress = 1.0 - Math.pow(1.0 - t, 4.0);

          gl.uniform2f(resLoc, canvas.width, canvas.height);
          gl.uniform1f(progLoc, progress);
          gl.uniform1f(timeLoc, now * 0.001);

          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.drawArrays(gl.TRIANGLES, 0, 6);

          if (t < 1.0) {
            animationFrameId = requestAnimationFrame(render);
          } else {
            cancelAnimationFrame(animationFrameId);
            if (callback) callback();
          }
        };

        animationFrameId = requestAnimationFrame(render);
      }
    };
  };

  // Preloader animation with Fluid Glass Noise Shader Reveal
  const initPreloader = () => {
    const loader = document.getElementById('loader') || document.getElementById('loading-overlay');
    if (!loader) {
      triggerMobileAutoScroll();
      return;
    }

    const canvas = document.getElementById('loader-shader-canvas');
    const shader = initShaderTransition(canvas);
    const pageWrapper = document.querySelector('.page-wrapper');

    // dmu-loader.svg runs animated SVG border stroke trace (3.4s) + smooth fill (0.5s at 3.4s).
    // At 3.9s, begin the fluid glass noise shader dissolve (duration 750ms, total runtime ~4.7s)
    setTimeout(() => {
      loader.classList.add('shader-active');
      if (pageWrapper) pageWrapper.classList.add('transition-active');

      if (shader) {
        shader.start(750, () => {
          loader.classList.add('hide');
          setTimeout(() => {
            loader.style.display = 'none';
            triggerMobileAutoScroll();
          }, 250);
        });
      } else {
        // Fallback for non-WebGL environments
        loader.classList.add('hide');
        setTimeout(() => {
          loader.style.display = 'none';
          triggerMobileAutoScroll();
        }, 400);
      }
    }, 3900);
  };

  initPreloader();
  initMobileHeroBlur();

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

  // Input Auto-Formatting & Masking (e.g. CRC-YYYYMMDD-XXX)
  const certInput = document.getElementById('cert-id-input');
  if (certInput) {
    certInput.addEventListener('input', () => {
      const raw = certInput.value;
      certInput.value = formatCertificateInput(raw);
    });
  }

  function formatCertificateInput(val) {
    if (!val) return '';
    const trimmed = val.trim();
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }
    const clean = val.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.startsWith('CRC')) {
      const rest = clean.slice(3);
      const datePart = rest.slice(0, 8);
      const suffix = rest.slice(8, 13);
      let res = 'CRC';
      if (datePart.length > 0) res += '-' + datePart;
      if (suffix.length > 0) res += '-' + suffix;
      return res;
    } else if (clean.length > 0 && !'CRC'.startsWith(clean)) {
      return val.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    }
    return clean;
  }

  // Built-in Camera QR Scanner Logic
  const openQrBtn = document.getElementById('open-qr-scanner-btn');
  const closeQrBtn = document.getElementById('close-qr-modal-btn');
  const qrModal = document.getElementById('qr-modal');
  const qrVideo = document.getElementById('qr-video');
  const switchCamBtn = document.getElementById('switch-camera-btn');
  const qrFileInput = document.getElementById('qr-file-input');
  const qrFeedback = document.getElementById('qr-scan-feedback');

  let activeStream = null;
  let qrScanActive = false;
  let currentFacingMode = 'environment';
  let barcodeDetector = null;

  if ('BarcodeDetector' in window) {
    try {
      barcodeDetector = new window.BarcodeDetector({ formats: ['qr_code'] });
    } catch (e) {
      console.warn('Native BarcodeDetector initialization notice:', e);
    }
  }

  const stopScanner = () => {
    qrScanActive = false;
    if (activeStream) {
      activeStream.getTracks().forEach(track => track.stop());
      activeStream = null;
    }
    if (qrVideo) qrVideo.srcObject = null;
    if (qrModal && qrModal.open) {
      qrModal.close();
    }
  };

  const processDetectedQr = (rawValue) => {
    if (!rawValue) return;
    stopScanner();

    let certId = rawValue.trim();
    try {
      const parsedUrl = new URL(certId);
      const urlId = parsedUrl.searchParams.get('id');
      if (urlId) certId = urlId;
    } catch {
      // Not a full URL, parse directly
    }

    const match = certId.match(/CRC-\d{8}-[A-Z0-9]{3,5}/i);
    if (match) {
      certId = match[0].toUpperCase();
      showToast(`QR Code Scanned: ${certId}`);
    } else if (/^https?:\/\//i.test(certId)) {
      showToast('Resolving Dynamic QR Link...');
    }

    const input = document.getElementById('cert-id-input');
    if (input) input.value = certId;
    runVerification(certId);
  };

  const startScanner = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (qrFeedback) qrFeedback.textContent = 'Camera not supported on this browser. Upload QR image below.';
      if (qrModal && !qrModal.open) qrModal.showModal();
      return;
    }

    try {
      if (qrFeedback) qrFeedback.textContent = 'Accessing camera...';
      if (qrModal && !qrModal.open) qrModal.showModal();

      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }

      activeStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: currentFacingMode } }
      });

      if (qrVideo) {
        qrVideo.srcObject = activeStream;
        await qrVideo.play();
      }

      if (switchCamBtn) switchCamBtn.style.display = 'inline-flex';
      qrScanActive = true;

      if (barcodeDetector) {
        if (qrFeedback) qrFeedback.textContent = 'Align certificate QR code within frame';
        const scanFrame = async () => {
          if (!qrScanActive || !qrVideo || qrVideo.readyState < 2) {
            if (qrScanActive) requestAnimationFrame(scanFrame);
            return;
          }

          try {
            const barcodes = await barcodeDetector.detect(qrVideo);
            if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
              processDetectedQr(barcodes[0].rawValue);
              return;
            }
          } catch (err) {
            // Frame skip
          }

          if (qrScanActive) requestAnimationFrame(scanFrame);
        };
        requestAnimationFrame(scanFrame);
      } else {
        if (qrFeedback) {
          qrFeedback.innerHTML = 'Direct video decode unsupported on this browser engine.<br>Upload QR image below or type ID.';
        }
      }
    } catch (err) {
      console.error('Camera access error:', err);
      if (qrFeedback) qrFeedback.textContent = 'Camera permission denied. Use "Upload QR Image" below.';
    }
  };

  if (openQrBtn) openQrBtn.addEventListener('click', startScanner);
  if (closeQrBtn) closeQrBtn.addEventListener('click', stopScanner);
  if (qrModal) {
    qrModal.addEventListener('close', stopScanner);
    qrModal.addEventListener('click', (e) => {
      const rect = qrModal.getBoundingClientRect();
      if (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      ) {
        stopScanner();
      }
    });
  }

  if (switchCamBtn) {
    switchCamBtn.addEventListener('click', () => {
      currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
      startScanner();
    });
  }

  if (qrFileInput) {
    qrFileInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!barcodeDetector) {
        showToast('Image scanning not supported on this browser. Please enter ID.');
        return;
      }

      try {
        if (qrFeedback) qrFeedback.textContent = 'Analyzing image...';
        const bitmap = await createImageBitmap(file);
        const barcodes = await barcodeDetector.detect(bitmap);
        if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
          processDetectedQr(barcodes[0].rawValue);
        } else {
          if (qrFeedback) qrFeedback.textContent = 'No QR code found in image. Please try another image.';
          showToast('No QR code detected in image.');
        }
      } catch (err) {
        console.error('File QR decode error:', err);
        showToast('Could not process image.');
      }
    });
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
    const rawInput = (candidateId || '').trim();
    const isUrl = /^https?:\/\//i.test(rawInput);
    const cleanId = isUrl ? rawInput : rawInput.toUpperCase();
    currentVerifiedId = cleanId;

    const verifyBtn = document.getElementById('verify-btn');
    const btnText = document.getElementById('btn-text');

    if (verifyBtn) verifyBtn.disabled = true;
    if (btnText) {
      btnText.textContent = isUrl ? 'Resolving QR Certificate...' : 'Querying Records...';
    }
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
        const finalId = result.cleanId || cleanId;
        currentVerifiedId = finalId;
        const inputField = document.getElementById('cert-id-input');
        if (inputField) inputField.value = finalId;

        // Keep URL in sync without triggering a reload (preserves bookmark & refresh integrity)
        const expectedSearch = `?id=${encodeURIComponent(finalId)}`;
        if (window.location.search !== expectedSearch) {
          window.history.replaceState({ id: finalId }, document.title, `${window.location.pathname}${expectedSearch}`);
        }

        renderVerificationSuccess(result.data, finalId, result.qrSvg);
      } else {
        const searchSection = document.getElementById('search-section');
        const resultContainer = document.getElementById('resultContainer');
        if (searchSection) searchSection.style.display = 'none';
        if (resultContainer) resultContainer.style.display = 'block';
        renderRecordNotFound(result.cleanId || cleanId, result.message);
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

// Mobile Hero Scroll-Driven Blur Effect (eases into blur smoothly with scroll)
function initMobileHeroBlur() {
  const heroSide = document.querySelector('.hero-side');
  if (!heroSide) return;

  let ticking = false;

  function updateHeroBlur() {
    // Only apply on mobile/tablet viewports
    if (window.innerWidth > 1024) {
      if (heroSide.style.filter) {
        heroSide.style.filter = '';
        heroSide.style.opacity = '';
        heroSide.style.transform = '';
      }
      ticking = false;
      return;
    }

    const scrollY = window.scrollY || window.pageYOffset || 0;
    // Calculate distance over which blur completes (reaches full blur as form card reaches view)
    const maxScroll = Math.max(160, Math.min(280, (heroSide.offsetHeight || 300) * 0.7));
    const progress = Math.min(Math.max(scrollY / maxScroll, 0), 1);

    if (progress <= 0.005) {
      heroSide.style.filter = '';
      heroSide.style.opacity = '';
      heroSide.style.transform = '';
    } else {
      // Natural sinusoidal ease-in-out curve
      const eased = 0.5 * (1 - Math.cos(Math.PI * progress));

      const blurPx = (eased * 10).toFixed(1); // 0px to 10px smooth blur
      const opacityVal = (1 - eased * 0.55).toFixed(2); // 1.0 down to 0.45 soft dim
      const scaleVal = (1 - eased * 0.035).toFixed(3); // 1.0 down to 0.965 subtle pull-back

      heroSide.style.filter = `blur(${blurPx}px)`;
      heroSide.style.opacity = opacityVal;
      heroSide.style.transform = `scale(${scaleVal})`;
    }

    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(updateHeroBlur);
      ticking = true;
    }
  }, { passive: true });

  window.addEventListener('resize', () => {
    if (!ticking) {
      requestAnimationFrame(updateHeroBlur);
      ticking = true;
    }
  }, { passive: true });

  // Initial check
  updateHeroBlur();
}

// Mobile Auto-Scroll (Landing Page - triggers after loading animation or clicking "Verify Another ID")
function triggerMobileAutoScroll(force = false) {
  const urlParams = new URLSearchParams(window.location.search);
  
  if ((force || !urlParams.get('id')) && window.innerWidth <= 1024) {
    // Pause so transition from verified view is visible before smooth scrolling
    setTimeout(() => {
      if (force || window.scrollY < 40) {
        const formSection = document.querySelector('.form-side');
        if (formSection && formSection.style.display !== 'none') {
          const targetY = formSection.getBoundingClientRect().top + window.scrollY;
          smoothScrollTo(targetY, force ? 800 : 1200);
        }
      }
    }, force ? 120 : 300);
  }
}

function renderVerificationSuccess(studentData, certId, qrSvg) {
  if (certId) currentVerifiedId = certId;

  document.body.classList.add('verified-view-active');
  document.getElementById('landing-view').style.display = 'none';
  const verifiedView = document.getElementById('verified-view');
  verifiedView.style.display = 'flex'; 
  
  // Reset scroll to top so verified view with official database badge is framed cleanly
  window.scrollTo(0, 0);

  verifiedView.setAttribute('data-verification-timestamp', new Date().toISOString());

  const idElem = document.getElementById('vd-cert-id');
  if (idElem) idElem.textContent = currentVerifiedId || '';

  const nameElem = document.getElementById('vd-name');
  if (nameElem) nameElem.textContent = studentData.name || '';

  const progElem = document.getElementById('vd-prog');
  if (progElem) progElem.textContent = studentData.programme || '';

  const dateElem = document.getElementById('vd-date');
  if (dateElem) dateElem.textContent = studentData.issuedOn || '';

  const rawStatus = (studentData.status || 'Valid').trim();
  const isRecordValid = rawStatus.toLowerCase() === 'valid';

  const statusElem = document.getElementById('vd-status');
  if (statusElem) {
    statusElem.textContent = rawStatus;
    if (isRecordValid) {
      statusElem.classList.remove('invalid-status');
      statusElem.classList.add('valid-status');
    } else {
      statusElem.classList.remove('valid-status');
      statusElem.classList.add('invalid-status');
    }
  }

  // Dynamic Header depending on Valid vs Revoked / Inactive
  const headingElem = document.getElementById('status-heading');
  const descElem = document.getElementById('status-description');
  const statusValidIcon = document.getElementById('status-valid-icon');
  const statusInvalidIcon = document.getElementById('status-invalid-icon');

  if (isRecordValid) {
    document.body.classList.remove('status-invalid');
    if (headingElem) headingElem.textContent = 'Official Record Verified';
    if (descElem) descElem.innerHTML = 'This certificate is authentic and has been<br> issued by Dhanamanjuri University.';
    if (statusValidIcon) statusValidIcon.style.display = 'block';
    if (statusInvalidIcon) statusInvalidIcon.style.display = 'none';
  } else {
    document.body.classList.add('status-invalid');
    if (headingElem) headingElem.textContent = `Certificate Inactive (${rawStatus})`;
    if (descElem) {
      descElem.textContent = 'Warning: This certificate credential is marked as ';
      const statusStrong = document.createElement('strong');
      statusStrong.textContent = rawStatus;
      descElem.appendChild(statusStrong);
      descElem.appendChild(document.createTextNode(' in university records.'));
    }
    if (statusValidIcon) statusValidIcon.style.display = 'none';
    if (statusInvalidIcon) statusInvalidIcon.style.display = 'block';
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

  // Custom Verification QR Code for Official Print Statement
  const printQrElem = document.getElementById('print-qr-code');
  if (printQrElem) {
    if (qrSvg) {
      printQrElem.innerHTML = qrSvg;
    } else if (window.QRCode && window.QRCode.toString) {
      const verifyUrl = `https://verification-dmu.vercel.app/?id=${encodeURIComponent(currentVerifiedId)}`;
      window.QRCode.toString(verifyUrl, {
        type: 'svg',
        margin: 0,
        color: {
          dark: '#091a36',
          light: '#ffffff'
        }
      }).then(svg => {
        printQrElem.innerHTML = svg;
      }).catch(err => {
        console.warn('Client QR render fallback notice:', err);
      });
    }
  }

  // Focus redirection for screen readers and keyboard navigation
  if (headingElem) {
    headingElem.focus();
  }
}

// Feature 3: Record Not Found
function renderRecordNotFound(displayId, customMessage) {
  const resultContainer = document.getElementById('resultContainer');
  const isBlank = !displayId || displayId === 'Blank';

  resultContainer.innerHTML = `
    <div class="not-found-card">
      <div class="not-found-icon-box">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
      </div>
      <div class="not-found-title" id="not-found-heading" tabindex="-1">RECORD NOT FOUND</div>
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

  const backBtn = document.getElementById('back-to-search-btn');
  // Attach listener to the dynamically created button (CSP-safe)
  backBtn.addEventListener('click', () => {
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

  // Focus redirection for not-found announcement
  backBtn.focus();

  if (window.innerWidth <= 1024) {
    setTimeout(() => {
      const formSection = document.querySelector('.form-side');
      if (formSection) {
        const targetY = formSection.getBoundingClientRect().top + window.scrollY;
        smoothScrollTo(targetY, 600);
      }
    }, 150);
  }
}

function resetSearch() {
  if (window.location.search) {
    window.history.replaceState({}, document.title, window.location.pathname);
  }
  document.body.classList.remove('verified-view-active');
  document.body.classList.remove('status-invalid');
  
  const verifiedView = document.getElementById('verified-view');
  if (verifiedView) verifiedView.style.display = 'none';
  
  const landingView = document.getElementById('landing-view');
  if (landingView) landingView.style.display = '';
  
  const inputField = document.getElementById('cert-id-input');
  if (inputField) {
    inputField.value = '';
  }

  // In mobile, trigger smooth auto-scroll to the certificate search card
  if (window.innerWidth <= 1024) {
    window.scrollTo(0, 0);
    triggerMobileAutoScroll(true);
  } else if (inputField) {
    inputField.focus();
  }
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

// Back link logic: go back without reloading if possible (strict same-origin referrer check)
document.querySelectorAll('a.back-link').forEach(link => {
  link.addEventListener('click', function(e) {
    try {
      if (window.history.length > 1 && document.referrer) {
        const refUrl = new URL(document.referrer);
        if (refUrl.origin === window.location.origin && refUrl.pathname === '/') {
          e.preventDefault();
          window.history.back();
        }
      }
    } catch {
      // Fallback to regular href navigation
    }
  });
});
