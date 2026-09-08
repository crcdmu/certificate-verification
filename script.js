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
    const loadingOverlay = document.getElementById('loading-overlay');

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

// Mobile Auto-Scroll (Landing Page Only - triggers strictly after loading animation ends)
function triggerMobileAutoScroll() {
  const urlParams = new URLSearchParams(window.location.search);
  
  if (!urlParams.get('id') && window.innerWidth <= 1024) {
    // Gentle 300ms pause so the user sees the landing page before smooth scrolling
    setTimeout(() => {
      // Only auto-scroll if user hasn't already scrolled manually
      if (window.scrollY < 40) {
        const formSection = document.querySelector('.form-side');
        if (formSection && formSection.style.display !== 'none') {
          const targetY = formSection.getBoundingClientRect().top + window.scrollY;
          smoothScrollTo(targetY, 1200);
        }
      }
    }, 300);
  }
}

function renderVerificationSuccess(studentData, certId) {
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

  const statusElem = document.getElementById('vd-status');
  if (statusElem) statusElem.textContent = studentData.status || '';

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
  window.location.href = window.location.pathname;
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
