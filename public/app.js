'use strict';

/* ============================================================
   TIDY MAIL - APPLICATION CONTROLLER
   State machine: upload → processing → complete | error
   ============================================================ */

(function () {

  // ============================================================
  // STATE MACHINE
  // ============================================================

  const STATES = { UPLOAD: 'upload', PROCESSING: 'processing', COMPLETE: 'complete', ERROR: 'error' };

  let currentState = STATES.UPLOAD;
  let currentJobId = null;
  let pollInterval = null;
  let selectedFile = null;
  let lastStats = {};
  let lastProgress = 0;
  let lastTotal = 0;

  const app = document.getElementById('app');

  function setState(newState) {
    if (currentState === newState) return;
    console.log(`[APP] State: ${currentState} → ${newState}`);
    currentState = newState;
    app.className = `state-${newState}`;
  }

  // ============================================================
  // DOM REFERENCES
  // ============================================================

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const els = {
    uploadZone: $('#uploadZone'),
    fileInput: $('#fileInput'),
    filePreview: $('#filePreview'),
    filePreviewName: $('#filePreviewName'),
    filePreviewSize: $('#filePreviewSize'),
    filePreviewClear: $('#filePreviewClear'),
    uploadSubmit: $('#uploadSubmit'),

    processCount: $('#processCount'),
    processTotal: $('#processTotal'),
    processStep: $('#processStep'),
    progressFill: $('#progressFill'),
    pipelineDots: $('#pipelineDots'),
    liveGoogle: $('#liveGoogle'),
    liveNonGoogle: $('#liveNonGoogle'),
    liveRemoved: $('#liveRemoved'),
    liveReview: $('#liveReview'),
    pencilLoader: $('#pencilLoader'),

    completeMeta: $('#completeMeta'),
    statGrid: $('#statGrid'),
    downloadBtn: $('#downloadBtn'),
    resetBtn: $('#resetBtn'),

    errorMessage: $('#errorMessage'),
    retryBtn: $('#retryBtn'),
  };

  // ============================================================
  // NUMBER ANIMATOR
  // ============================================================

  function easeOutExpo(t) {
    return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
  }

  function animateNumber(element, from, to, duration) {
    if (from === to) {
      element.textContent = formatNumber(to);
      return;
    }

    const startTime = performance.now();
    const diff = to - from;

    function tick(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutExpo(progress);
      const current = Math.round(from + diff * easedProgress);

      element.textContent = formatNumber(current);

      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    }

    requestAnimationFrame(tick);
  }

  function formatNumber(n) {
    if (typeof n !== 'number' || isNaN(n)) return '0';
    return n.toLocaleString('en-US');
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function formatDuration(ms) {
    if (!ms) return '';
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  // ============================================================
  // FILE UPLOAD HANDLING
  // ============================================================

  // Click to upload
  els.uploadZone.addEventListener('click', () => {
    els.fileInput.click();
  });

  // Keyboard accessibility
  els.uploadZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      els.fileInput.click();
    }
  });

  // File selected via input
  els.fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) selectFile(file);
  });

  // Drag and drop
  els.uploadZone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    e.stopPropagation();
    els.uploadZone.classList.add('drag-over');
  });

  els.uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    els.uploadZone.classList.add('drag-over');
  });

  els.uploadZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Only remove if actually leaving the zone, not entering a child
    const rect = els.uploadZone.getBoundingClientRect();
    if (
      e.clientX <= rect.left || e.clientX >= rect.right ||
      e.clientY <= rect.top || e.clientY >= rect.bottom
    ) {
      els.uploadZone.classList.remove('drag-over');
    }
  });

  els.uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    els.uploadZone.classList.remove('drag-over');

    const file = e.dataTransfer.files[0];
    if (file) selectFile(file);
  });

  // Prevent default drag behavior on the body
  document.body.addEventListener('dragover', (e) => e.preventDefault());
  document.body.addEventListener('drop', (e) => e.preventDefault());

  // Clear file selection
  els.filePreviewClear.addEventListener('click', (e) => {
    e.stopPropagation();
    clearFile();
  });

  function selectFile(file) {
    const validTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/csv',
      'text/x-csv',
      'application/x-csv',
    ];
    const validExts = ['.csv', '.xls', '.xlsx'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();

    if (!validExts.includes(ext)) {
      showError('Invalid file type. Please upload a CSV, XLS, or XLSX file.');
      return;
    }

    selectedFile = file;
    els.filePreviewName.textContent = file.name;
    els.filePreviewSize.textContent = formatBytes(file.size);
    els.filePreview.classList.add('visible');
    els.uploadSubmit.disabled = false;

    console.log(`[APP] File selected: ${file.name} (${formatBytes(file.size)})`);
  }

  function clearFile() {
    selectedFile = null;
    els.fileInput.value = '';
    els.filePreview.classList.remove('visible');
    els.uploadSubmit.disabled = true;
    els.filePreviewName.textContent = '';
    els.filePreviewSize.textContent = '';
  }

  // ============================================================
  // UPLOAD SUBMIT
  // ============================================================

  els.uploadSubmit.addEventListener('click', async () => {
    if (!selectedFile || els.uploadSubmit.disabled) return;

    els.uploadSubmit.disabled = true;

    try {
      // Delete previous job if any
      if (currentJobId) {
        try {
          await fetch(`/api/job/${currentJobId}`, { method: 'DELETE' });
        } catch (_) {}
        currentJobId = null;
      }

      const formData = new FormData();
      formData.append('file', selectedFile);

      console.log('[APP] Uploading file...');

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(err.error || `Upload failed with status ${response.status}`);
      }

      const data = await response.json();
      currentJobId = data.jobId;

      console.log(`[APP] Job created: ${currentJobId}`);

      // Reset processing UI
      resetProcessingUI();

      // Switch to processing state
      setState(STATES.PROCESSING);

      // Start polling
      startPolling();

    } catch (err) {
      console.error('[APP] Upload error:', err);
      showError(err.message || 'Failed to upload file. Please try again.');
      els.uploadSubmit.disabled = false;
    }
  });

  // ============================================================
  // POLLING
  // ============================================================

  function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(pollStatus, 800);
    // Also poll immediately
    pollStatus();
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  async function pollStatus() {
    if (!currentJobId) return;

    try {
      const response = await fetch(`/api/status/${currentJobId}`);

      if (!response.ok) {
        if (response.status === 404) {
          stopPolling();
          showError('Job not found. It may have expired.');
          return;
        }
        return; // Retry on next poll
      }

      const status = await response.json();
      updateProcessingUI(status);

      if (status.status === 'complete') {
        stopPolling();
        showComplete(status);
      } else if (status.status === 'error') {
        stopPolling();
        showError(status.error || 'An error occurred during processing.');
      }

    } catch (err) {
      console.warn('[APP] Poll error (will retry):', err.message);
      // Don't stop polling on network errors - just retry
    }
  }

  // ============================================================
  // PROCESSING UI UPDATES
  // ============================================================

  const STAGE_ORDER = ['parsing', 'cleaning', 'fixing', 'validating', 'dns', 'mx', 'categorizing', 'complete'];

  function resetProcessingUI() {
    els.processCount.textContent = '0';
    els.processTotal.textContent = 'of 0';
    els.processStep.textContent = 'Starting...';
    els.progressFill.style.width = '0%';
    lastStats = {};
    lastProgress = 0;
    lastTotal = 0;

    // Reset pipeline dots
    $$('.pipeline-dot').forEach(dot => {
      dot.classList.remove('completed', 'active');
    });

    // Reset live stats
    els.liveGoogle.textContent = '0';
    els.liveNonGoogle.textContent = '0';
    els.liveRemoved.textContent = '0';
    els.liveReview.textContent = '0';

    // Hide pencil loader
    els.pencilLoader.classList.remove('visible');
  }

  function updateProcessingUI(status) {
    // Update step text
    els.processStep.textContent = status.currentStep || 'Processing...';

    // Animate the main counter
    const newProgress = status.progress || 0;
    const newTotal = status.total || 0;

    if (newProgress !== lastProgress) {
      animateNumber(els.processCount, lastProgress, newProgress, 600);
      lastProgress = newProgress;
    }

    els.processTotal.textContent = `of ${formatNumber(newTotal)}`;

    // Progress bar
    const pct = newTotal > 0 ? Math.min((newProgress / newTotal) * 100, 100) : 0;
    els.progressFill.style.width = `${pct}%`;

    // Pipeline dots
    updatePipelineDots(status.status);

    // Live stats
    if (status.stats) {
      updateLiveStat(els.liveGoogle, lastStats.googleWorkspace || 0, status.stats.googleWorkspace || 0);
      updateLiveStat(els.liveNonGoogle, lastStats.nonGoogle || 0, status.stats.nonGoogle || 0);
      updateLiveStat(els.liveRemoved, lastStats.removed || 0, status.stats.removed || 0);

      const reviewCount = (status.stats.needsReview || 0) + (status.stats.roleBased || 0);
      const lastReviewCount = (lastStats.needsReview || 0) + (lastStats.roleBased || 0);
      updateLiveStat(els.liveReview, lastReviewCount, reviewCount);

      lastStats = { ...status.stats };
    }

    // Pencil loader visibility (during dns/mx stages)
    if (status.status === 'dns' || status.status === 'mx') {
      els.pencilLoader.classList.add('visible');
    } else {
      els.pencilLoader.classList.remove('visible');
    }
  }

  function updateLiveStat(element, from, to) {
    if (from !== to) {
      animateNumber(element, from, to, 500);
    }
  }

  function updatePipelineDots(currentStatus) {
    const currentIdx = STAGE_ORDER.indexOf(currentStatus);
    if (currentIdx === -1) return;

    $$('.pipeline-dot').forEach((dot, i) => {
      const dotStage = dot.getAttribute('data-stage');
      const dotIdx = STAGE_ORDER.indexOf(dotStage);

      dot.classList.remove('completed', 'active');

      if (dotIdx < currentIdx) {
        dot.classList.add('completed');
      } else if (dotIdx === currentIdx) {
        dot.classList.add('active');
      }
    });
  }

  // ============================================================
  // COMPLETE STATE
  // ============================================================

  function showComplete(status) {
    const fileName = status.fileName || 'your file';
    const duration = formatDuration(status.durationMs);
    els.completeMeta.textContent = `Processed ${fileName}${duration ? ' in ' + duration : ''}`;

    // Animate stat cards
    const stats = status.stats || {};
    const statNumbers = $$('.stat-card-number');

    statNumbers.forEach(el => {
      const key = el.getAttribute('data-stat');
      const value = stats[key] || 0;

      // Small delay for staggered animation
      setTimeout(() => {
        animateNumber(el, 0, value, 1200);
      }, 100);
    });

    setState(STATES.COMPLETE);
  }

  // Download handler
  els.downloadBtn.addEventListener('click', () => {
    if (!currentJobId) return;
    window.location.href = `/api/download/${currentJobId}`;
  });

  // Reset handler
  els.resetBtn.addEventListener('click', async () => {
    // Clean up old job
    if (currentJobId) {
      try {
        await fetch(`/api/job/${currentJobId}`, { method: 'DELETE' });
      } catch (_) {}
      currentJobId = null;
    }

    clearFile();
    resetProcessingUI();
    setState(STATES.UPLOAD);
  });

  // ============================================================
  // ERROR STATE
  // ============================================================

  function showError(message) {
    els.errorMessage.textContent = message || 'An unexpected error occurred.';
    stopPolling();
    setState(STATES.ERROR);
  }

  // Retry handler
  els.retryBtn.addEventListener('click', async () => {
    if (currentJobId) {
      try {
        await fetch(`/api/job/${currentJobId}`, { method: 'DELETE' });
      } catch (_) {}
      currentJobId = null;
    }

    clearFile();
    resetProcessingUI();
    setState(STATES.UPLOAD);
  });

  // ============================================================
  // INITIALIZATION
  // ============================================================

  console.log('[APP] Tidy Mail initialized');
  setState(STATES.UPLOAD);

})();