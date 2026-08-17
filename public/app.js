'use strict';

(function () {

  const app = document.getElementById('app');

  let currentView = 'dashboard';
  let workspaceState = 'upload';
  let sepState = 'upload';

  // Full pipeline state
  let currentJobId = null;
  let pollInterval = null;
  let selectedFile = null;
  let lastStats = {};
  let lastProgress = 0;
  let lockedTotal = 0;      // total is locked once set to prevent glitchy jumps
  let hasSavedCurrentJob = false;
  let inFlightAnimations = [];  // track requestAnimationFrame IDs to cancel

  // Separator state
  let sepCurrentJobId = null;
  let sepPollInterval = null;
  let sepSelectedFile = null;
  let sepLastStats = {};
  let sepLastProgress = 0;
  let sepLockedTotal = 0;
  let sepHasSavedCurrentJob = false;
  let sepInFlightAnimations = [];

  const ACTIVITY_KEY = 'tidymail_activity';

  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);

  const els = {
    navItems: $$('.nav-item'),
    breadcrumbCurrent: $('#breadcrumbCurrent'),

    // Workspace
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
    liveGoogle: $('#liveGoogle'),
    liveNonGoogle: $('#liveNonGoogle'),
    liveRemoved: $('#liveRemoved'),
    liveReview: $('#liveReview'),
    pencilLoader: $('#pencilLoader'),

    completeMeta: $('#completeMeta'),
    downloadBtn: $('#downloadBtn'),
    resetBtn: $('#resetBtn'),

    errorMessage: $('#errorMessage'),
    retryBtn: $('#retryBtn'),

    wsUpload: $('#wsUpload'),
    wsProcessing: $('#wsProcessing'),
    wsComplete: $('#wsComplete'),
    wsError: $('#wsError'),

    // Separator
    sepUploadZone: $('#sepUploadZone'),
    sepFileInput: $('#sepFileInput'),
    sepFilePreview: $('#sepFilePreview'),
    sepFilePreviewName: $('#sepFilePreviewName'),
    sepFilePreviewSize: $('#sepFilePreviewSize'),
    sepFilePreviewClear: $('#sepFilePreviewClear'),
    sepUploadSubmit: $('#sepUploadSubmit'),
    checkGoogleMx: $('#checkGoogleMx'),

    sepProcessCount: $('#sepProcessCount'),
    sepProcessTotal: $('#sepProcessTotal'),
    sepProcessStep: $('#sepProcessStep'),
    sepProgressFill: $('#sepProgressFill'),
    sepLiveBusiness: $('#sepLiveBusiness'),
    sepLiveConsumer: $('#sepLiveConsumer'),
    sepLiveGoogle: $('#sepLiveGoogle'),
    sepLiveGoogleCard: $('#sepLiveGoogleCard'),
    sepPencilLoader: $('#sepPencilLoader'),

    sepCompleteMeta: $('#sepCompleteMeta'),
    sepDownloadBtn: $('#sepDownloadBtn'),
    sepResetBtn: $('#sepResetBtn'),
    sepResultGoogleCard: $('#sepResultGoogleCard'),

    sepErrorMessage: $('#sepErrorMessage'),
    sepRetryBtn: $('#sepRetryBtn'),

    sepUpload: $('#sepUpload'),
    sepProcessing: $('#sepProcessing'),
    sepComplete: $('#sepComplete'),
    sepError: $('#sepError'),

    // Dashboard
    dashGoWorkspace: $('#dashGoWorkspace'),
    dashGoSeparator: $('#dashGoSeparator'),
    dashGoActivity: $('#dashGoActivity'),
    dashLatestJob: $('#dashLatestJob'),

    activityContainer: $('#activityContainer'),
  };

  // ============================================================
  // VIEW ROUTING
  // ============================================================
  function setView(view) {
    if (currentView === view) return;
    currentView = view;
    app.className = `view-${view}`;
    els.navItems.forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
    const labels = { dashboard: 'Dashboard', workspace: 'Workspace', separator: 'Domain Separator', activity: 'Activity Logs' };
    els.breadcrumbCurrent.textContent = labels[view] || view;
    if (view === 'dashboard') renderDashboard();
    if (view === 'activity') renderActivity();
  }

  els.navItems.forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.view)));
  els.dashGoWorkspace.addEventListener('click', () => setView('workspace'));
  els.dashGoSeparator.addEventListener('click', () => setView('separator'));
  els.dashGoActivity.addEventListener('click', () => setView('activity'));

  // ============================================================
  // SUBSTATE ROUTING
  // ============================================================
  function setWorkspaceState(state) {
    workspaceState = state;
    [els.wsUpload, els.wsProcessing, els.wsComplete, els.wsError].forEach(el => el.classList.remove('active'));
    const map = { upload: els.wsUpload, processing: els.wsProcessing, complete: els.wsComplete, error: els.wsError };
    if (map[state]) map[state].classList.add('active');
  }

  function setSepState(state) {
    sepState = state;
    [els.sepUpload, els.sepProcessing, els.sepComplete, els.sepError].forEach(el => el.classList.remove('active'));
    const map = { upload: els.sepUpload, processing: els.sepProcessing, complete: els.sepComplete, error: els.sepError };
    if (map[state]) map[state].classList.add('active');
  }

  // ============================================================
  // NUMBER ANIMATION (with cancel tracking)
  // ============================================================
  function easeOutExpo(t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); }

  function animateNumber(el, from, to, duration = 800, animationsArray = null) {
    if (from === to) { el.textContent = fmt(to); return null; }
    const start = performance.now();
    const diff = to - from;
    let rafId;
    function tick(now) {
      const p = Math.min((now - start) / duration, 1);
      el.textContent = fmt(Math.round(from + diff * easeOutExpo(p)));
      if (p < 1) {
        rafId = requestAnimationFrame(tick);
        if (animationsArray) {
          // update the ID in the array
          const idx = animationsArray.indexOf(rafId - 1);
          if (idx !== -1) animationsArray[idx] = rafId;
        }
      }
    }
    rafId = requestAnimationFrame(tick);
    if (animationsArray) animationsArray.push(rafId);
    return rafId;
  }

  function cancelAllAnimations(animationsArray) {
    if (!animationsArray) return;
    for (const id of animationsArray) {
      try { cancelAnimationFrame(id); } catch (_) {}
    }
    animationsArray.length = 0;
  }

  function fmt(n) {
    if (typeof n !== 'number' || isNaN(n)) return '0';
    return n.toLocaleString('en-US');
  }

  function fmtBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function fmtDuration(ms) {
    if (!ms) return '';
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  }

  function fmtTimeAgo(iso) {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  // ============================================================
  // GENERIC UPLOAD HANDLERS (factory)
  // ============================================================
  function setupUpload({ zone, input, preview, previewName, previewSize, clearBtn, submitBtn, onSelect, onClear }) {
    zone.addEventListener('click', () => input.click());

    zone.addEventListener('mousemove', (e) => {
      const rect = zone.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      zone.style.setProperty('--mx', x + '%');
      zone.style.setProperty('--my', y + '%');
    });

    zone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        input.click();
      }
    });

    input.addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (f) onSelect(f);
    });

    ['dragenter', 'dragover'].forEach(ev => {
      zone.addEventListener(ev, (e) => {
        e.preventDefault(); e.stopPropagation();
        zone.classList.add('drag-over');
      });
    });

    zone.addEventListener('dragleave', (e) => {
      e.preventDefault(); e.stopPropagation();
      const r = zone.getBoundingClientRect();
      if (e.clientX <= r.left || e.clientX >= r.right || e.clientY <= r.top || e.clientY >= r.bottom) {
        zone.classList.remove('drag-over');
      }
    });

    zone.addEventListener('drop', (e) => {
      e.preventDefault(); e.stopPropagation();
      zone.classList.remove('drag-over');
      const f = e.dataTransfer.files[0];
      if (f) onSelect(f);
    });

    clearBtn.addEventListener('click', (e) => { e.stopPropagation(); onClear(); });
  }

  document.body.addEventListener('dragover', e => e.preventDefault());
  document.body.addEventListener('drop', e => e.preventDefault());

  function validateFile(file, errorHandler) {
    const validExts = ['.csv', '.xls', '.xlsx'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!validExts.includes(ext)) {
      errorHandler('Invalid file type. Please upload CSV, XLS, or XLSX.');
      return false;
    }
    return true;
  }

  // ============================================================
  // FULL WORKSPACE UPLOAD
  // ============================================================
  setupUpload({
    zone: els.uploadZone,
    input: els.fileInput,
    preview: els.filePreview,
    previewName: els.filePreviewName,
    previewSize: els.filePreviewSize,
    clearBtn: els.filePreviewClear,
    submitBtn: els.uploadSubmit,
    onSelect: (file) => {
      if (!validateFile(file, showError)) return;
      selectedFile = file;
      els.filePreviewName.textContent = file.name;
      els.filePreviewSize.textContent = fmtBytes(file.size);
      els.filePreview.classList.add('visible');
      els.uploadSubmit.disabled = false;
    },
    onClear: () => {
      selectedFile = null;
      els.fileInput.value = '';
      els.filePreview.classList.remove('visible');
      els.uploadSubmit.disabled = true;
    },
  });

  els.uploadSubmit.addEventListener('click', async () => {
    if (!selectedFile || els.uploadSubmit.disabled) return;
    els.uploadSubmit.disabled = true;

    try {
      if (currentJobId) {
        try { await fetch(`/api/job/${currentJobId}`, { method: 'DELETE' }); } catch (_) {}
        currentJobId = null;
      }

      const fd = new FormData();
      fd.append('file', selectedFile);

      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(err.error || `Upload failed (${res.status})`);
      }
      const data = await res.json();
      currentJobId = data.jobId;
      hasSavedCurrentJob = false;

      resetProcessingUI();
      setWorkspaceState('processing');
      startPolling();
    } catch (err) {
      showError(err.message || 'Failed to upload file.');
      els.uploadSubmit.disabled = false;
    }
  });

  function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(pollStatus, 800);
    pollStatus();
  }

  function stopPolling() {
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
  }

  async function pollStatus() {
    if (!currentJobId) return;
    try {
      const res = await fetch(`/api/status/${currentJobId}`);
      if (!res.ok) {
        if (res.status === 404) { stopPolling(); showError('Job not found. It may have expired.'); }
        return;
      }
      const status = await res.json();
      updateProcessingUI(status);
      if (status.status === 'complete') {
        stopPolling();
        if (!hasSavedCurrentJob) {
          saveToActivity(status, 'full');
          hasSavedCurrentJob = true;
        }
        showComplete(status);
      } else if (status.status === 'error') {
        stopPolling();
        showError(status.error || 'Processing failed.');
      }
    } catch (_) {}
  }

  const STAGE_ORDER = ['parsing', 'cleaning', 'fixing', 'validating', 'dns', 'mx', 'categorizing', 'complete'];

  function resetProcessingUI() {
    cancelAllAnimations(inFlightAnimations);
    els.processCount.textContent = '0';
    els.processTotal.textContent = 'of 0';
    els.processStep.textContent = 'Starting up...';
    els.progressFill.style.width = '0%';
    lastStats = {};
    lastProgress = 0;
    lockedTotal = 0;
    $$('.pipeline-dot').forEach(d => d.classList.remove('completed', 'active'));
    ['liveGoogle', 'liveNonGoogle', 'liveRemoved', 'liveReview'].forEach(k => els[k].textContent = '0');
    els.pencilLoader.classList.remove('visible');
  }

  function updateProcessingUI(status) {
    els.processStep.textContent = status.currentStep || 'Processing...';
    const p = status.progress || 0;
    const t = status.total || 0;

    // LOCK TOTAL: only update visible total if it goes UP or if we haven't seen one yet.
    // This prevents "5 of 13567" glitches where a later stage reports a smaller total.
    if (t > lockedTotal) {
      lockedTotal = t;
    }
    els.processTotal.textContent = `of ${fmt(lockedTotal)}`;

    // Cap progress at lockedTotal so we never show weird "12000 of 5000"
    const safeP = Math.min(p, lockedTotal || p);

    if (safeP !== lastProgress) {
      animateNumber(els.processCount, lastProgress, safeP, 500, inFlightAnimations);
      lastProgress = safeP;
    }

    els.progressFill.style.width = lockedTotal > 0 ? `${Math.min((safeP / lockedTotal) * 100, 100)}%` : '0%';

    updatePipelineDots(status.status);

    if (status.stats) {
      updateLive(els.liveGoogle, lastStats.googleWorkspace || 0, status.stats.googleWorkspace || 0);
      updateLive(els.liveNonGoogle, lastStats.nonGoogle || 0, status.stats.nonGoogle || 0);
      updateLive(els.liveRemoved, lastStats.removed || 0, status.stats.removed || 0);
      const rc = (status.stats.needsReview || 0) + (status.stats.roleBased || 0);
      const lrc = (lastStats.needsReview || 0) + (lastStats.roleBased || 0);
      updateLive(els.liveReview, lrc, rc);
      lastStats = { ...status.stats };
    }

    if (status.status === 'dns' || status.status === 'mx') {
      els.pencilLoader.classList.add('visible');
    } else {
      els.pencilLoader.classList.remove('visible');
    }
  }

  function updateLive(el, from, to) {
    if (from !== to) animateNumber(el, from, to, 500, inFlightAnimations);
  }

  function updatePipelineDots(status) {
    const idx = STAGE_ORDER.indexOf(status);
    if (idx === -1) return;
    $$('#pipelineDots .pipeline-dot').forEach(dot => {
      const di = STAGE_ORDER.indexOf(dot.dataset.stage);
      dot.classList.remove('completed', 'active');
      if (di < idx) dot.classList.add('completed');
      else if (di === idx) dot.classList.add('active');
    });
  }

  function showComplete(status) {
    // CRITICAL FIX: cancel all in-flight number animations before setting final values
    cancelAllAnimations(inFlightAnimations);

    const dur = fmtDuration(status.durationMs);
    els.completeMeta.textContent = `Processed ${status.fileName || 'your file'}${dur ? ' in ' + dur : ''}`;
    const stats = status.stats || {};

    // Set all result cards to 0 first, then animate
    $$('#wsComplete .result-card-number').forEach(el => { el.textContent = '0'; });

    setTimeout(() => {
      $$('#wsComplete .result-card-number').forEach(el => {
        const key = el.dataset.stat;
        const val = stats[key] || 0;
        animateNumber(el, 0, val, 1200);
      });
    }, 100);

    setWorkspaceState('complete');
  }

  els.downloadBtn.addEventListener('click', () => {
    if (!currentJobId) return;
    window.location.href = `/api/download/${currentJobId}`;
  });

  els.resetBtn.addEventListener('click', async () => {
    if (currentJobId) {
      try { await fetch(`/api/job/${currentJobId}`, { method: 'DELETE' }); } catch (_) {}
      currentJobId = null;
    }
    hasSavedCurrentJob = false;
    selectedFile = null;
    els.fileInput.value = '';
    els.filePreview.classList.remove('visible');
    els.uploadSubmit.disabled = true;
    resetProcessingUI();
    setWorkspaceState('upload');
  });

  function showError(msg) {
    els.errorMessage.textContent = msg || 'Unexpected error occurred.';
    stopPolling();
    setWorkspaceState('error');
    setView('workspace');
  }

  els.retryBtn.addEventListener('click', async () => {
    if (currentJobId) {
      try { await fetch(`/api/job/${currentJobId}`, { method: 'DELETE' }); } catch (_) {}
      currentJobId = null;
    }
    hasSavedCurrentJob = false;
    selectedFile = null;
    els.fileInput.value = '';
    els.filePreview.classList.remove('visible');
    els.uploadSubmit.disabled = true;
    resetProcessingUI();
    setWorkspaceState('upload');
  });

  // ============================================================
  // SEPARATOR UPLOAD
  // ============================================================
  setupUpload({
    zone: els.sepUploadZone,
    input: els.sepFileInput,
    preview: els.sepFilePreview,
    previewName: els.sepFilePreviewName,
    previewSize: els.sepFilePreviewSize,
    clearBtn: els.sepFilePreviewClear,
    submitBtn: els.sepUploadSubmit,
    onSelect: (file) => {
      if (!validateFile(file, showSepError)) return;
      sepSelectedFile = file;
      els.sepFilePreviewName.textContent = file.name;
      els.sepFilePreviewSize.textContent = fmtBytes(file.size);
      els.sepFilePreview.classList.add('visible');
      els.sepUploadSubmit.disabled = false;
    },
    onClear: () => {
      sepSelectedFile = null;
      els.sepFileInput.value = '';
      els.sepFilePreview.classList.remove('visible');
      els.sepUploadSubmit.disabled = true;
    },
  });

  els.sepUploadSubmit.addEventListener('click', async () => {
    if (!sepSelectedFile || els.sepUploadSubmit.disabled) return;
    els.sepUploadSubmit.disabled = true;

    try {
      if (sepCurrentJobId) {
        try { await fetch(`/api/job/${sepCurrentJobId}`, { method: 'DELETE' }); } catch (_) {}
        sepCurrentJobId = null;
      }

      const checkMx = els.checkGoogleMx.checked;
      const fd = new FormData();
      fd.append('file', sepSelectedFile);
      fd.append('checkGoogleMx', checkMx ? 'true' : 'false');

      // Show/hide Google MX card based on checkbox
      if (checkMx) {
        els.sepLiveGoogleCard.classList.remove('hidden');
        els.sepResultGoogleCard.classList.remove('hidden');
      } else {
        els.sepLiveGoogleCard.classList.add('hidden');
        els.sepResultGoogleCard.classList.add('hidden');
      }

      const res = await fetch('/api/separator', { method: 'POST', body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(err.error || `Upload failed (${res.status})`);
      }
      const data = await res.json();
      sepCurrentJobId = data.jobId;
      sepHasSavedCurrentJob = false;

      resetSepProcessingUI();
      setSepState('processing');
      startSepPolling();
    } catch (err) {
      showSepError(err.message || 'Failed to upload file.');
      els.sepUploadSubmit.disabled = false;
    }
  });

  function startSepPolling() {
    if (sepPollInterval) clearInterval(sepPollInterval);
    sepPollInterval = setInterval(sepPollStatus, 800);
    sepPollStatus();
  }

  function stopSepPolling() {
    if (sepPollInterval) { clearInterval(sepPollInterval); sepPollInterval = null; }
  }

  async function sepPollStatus() {
    if (!sepCurrentJobId) return;
    try {
      const res = await fetch(`/api/status/${sepCurrentJobId}`);
      if (!res.ok) {
        if (res.status === 404) { stopSepPolling(); showSepError('Job not found. It may have expired.'); }
        return;
      }
      const status = await res.json();
      updateSepProcessingUI(status);
      if (status.status === 'complete') {
        stopSepPolling();
        if (!sepHasSavedCurrentJob) {
          saveToActivity(status, 'separator');
          sepHasSavedCurrentJob = true;
        }
        showSepComplete(status);
      } else if (status.status === 'error') {
        stopSepPolling();
        showSepError(status.error || 'Processing failed.');
      }
    } catch (_) {}
  }

  function resetSepProcessingUI() {
    cancelAllAnimations(sepInFlightAnimations);
    els.sepProcessCount.textContent = '0';
    els.sepProcessTotal.textContent = 'of 0';
    els.sepProcessStep.textContent = 'Starting...';
    els.sepProgressFill.style.width = '0%';
    sepLastStats = {};
    sepLastProgress = 0;
    sepLockedTotal = 0;
    els.sepLiveBusiness.textContent = '0';
    els.sepLiveConsumer.textContent = '0';
    els.sepLiveGoogle.textContent = '0';
    els.sepPencilLoader.classList.remove('visible');
  }

  function updateSepProcessingUI(status) {
    els.sepProcessStep.textContent = status.currentStep || 'Processing...';
    const p = status.progress || 0;
    const t = status.total || 0;

    if (t > sepLockedTotal) sepLockedTotal = t;
    els.sepProcessTotal.textContent = `of ${fmt(sepLockedTotal)}`;

    const safeP = Math.min(p, sepLockedTotal || p);

    if (safeP !== sepLastProgress) {
      animateNumber(els.sepProcessCount, sepLastProgress, safeP, 500, sepInFlightAnimations);
      sepLastProgress = safeP;
    }
    els.sepProgressFill.style.width = sepLockedTotal > 0 ? `${Math.min((safeP / sepLockedTotal) * 100, 100)}%` : '0%';

    if (status.stats) {
      updateSepLive(els.sepLiveBusiness, sepLastStats.business || 0, status.stats.business || 0);
      updateSepLive(els.sepLiveConsumer, sepLastStats.consumer || 0, status.stats.consumer || 0);
      updateSepLive(els.sepLiveGoogle, sepLastStats.googleWorkspace || 0, status.stats.googleWorkspace || 0);
      sepLastStats = { ...status.stats };
    }

    if (status.status === 'mx') {
      els.sepPencilLoader.classList.add('visible');
    } else {
      els.sepPencilLoader.classList.remove('visible');
    }
  }

  function updateSepLive(el, from, to) {
    if (from !== to) animateNumber(el, from, to, 500, sepInFlightAnimations);
  }

  function showSepComplete(status) {
    cancelAllAnimations(sepInFlightAnimations);

    const dur = fmtDuration(status.durationMs);
    els.sepCompleteMeta.textContent = `${status.fileName || 'File'} · ${dur || '—'}`;
    const stats = status.stats || {};

    $$('#sepComplete .sep-result-number').forEach(el => { el.textContent = '0'; });

    setTimeout(() => {
      $$('#sepComplete .sep-result-number').forEach(el => {
        const key = el.dataset.stat;
        const val = stats[key] || 0;
        animateNumber(el, 0, val, 1200);
      });
    }, 100);

    setSepState('complete');
  }

  els.sepDownloadBtn.addEventListener('click', () => {
    if (!sepCurrentJobId) return;
    window.location.href = `/api/download/${sepCurrentJobId}`;
  });

  els.sepResetBtn.addEventListener('click', async () => {
    if (sepCurrentJobId) {
      try { await fetch(`/api/job/${sepCurrentJobId}`, { method: 'DELETE' }); } catch (_) {}
      sepCurrentJobId = null;
    }
    sepHasSavedCurrentJob = false;
    sepSelectedFile = null;
    els.sepFileInput.value = '';
    els.sepFilePreview.classList.remove('visible');
    els.sepUploadSubmit.disabled = true;
    els.checkGoogleMx.checked = false;
    resetSepProcessingUI();
    setSepState('upload');
  });

  function showSepError(msg) {
    els.sepErrorMessage.textContent = msg || 'Unexpected error occurred.';
    stopSepPolling();
    setSepState('error');
    setView('separator');
  }

  els.sepRetryBtn.addEventListener('click', async () => {
    if (sepCurrentJobId) {
      try { await fetch(`/api/job/${sepCurrentJobId}`, { method: 'DELETE' }); } catch (_) {}
      sepCurrentJobId = null;
    }
    sepHasSavedCurrentJob = false;
    sepSelectedFile = null;
    els.sepFileInput.value = '';
    els.sepFilePreview.classList.remove('visible');
    els.sepUploadSubmit.disabled = true;
    resetSepProcessingUI();
    setSepState('upload');
  });

  // ============================================================
  // ACTIVITY (shared, tags mode)
  // ============================================================
  function saveToActivity(status, mode) {
    try {
      const activity = getActivity();
      if (status.jobId && activity.some(entry => entry.jobId === status.jobId)) return;

      const entry = {
        jobId: status.jobId,
        mode: mode || 'full',
        fileName: status.fileName,
        completedAt: status.completedAt || new Date().toISOString(),
        durationMs: status.durationMs,
        stats: status.stats,
      };
      activity.unshift(entry);
      localStorage.setItem(ACTIVITY_KEY, JSON.stringify(activity.slice(0, 20)));
    } catch (_) {}
  }

  function getActivity() {
    try {
      const raw = localStorage.getItem(ACTIVITY_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      const seen = new Set();
      const deduped = [];
      for (const entry of parsed) {
        const key = entry.jobId || `${entry.fileName}-${entry.completedAt}`;
        if (!seen.has(key)) { seen.add(key); deduped.push(entry); }
      }
      return deduped;
    } catch (_) { return []; }
  }

  // ============================================================
  // DASHBOARD RENDER
  // ============================================================
  function renderDashboard() {
    const activity = getActivity();
    // find latest FULL pipeline job for the stats (separator has different stats shape)
    const latestFull = activity.find(e => e.mode !== 'separator');
    const latest = activity[0];

    const g = latestFull ? (latestFull.stats.googleWorkspace || 0) : 0;
    const ng = latestFull ? (latestFull.stats.nonGoogle || 0) : 0;
    const rm = latestFull ? (latestFull.stats.removed || 0) : 0;
    const total = g + ng + rm;

    const totalEl = document.querySelector('#viewDashboard [data-stat="total"]');
    const gEl = document.querySelector('#viewDashboard [data-stat="google"]');
    const ngEl = document.querySelector('#viewDashboard [data-stat="nongoogle"]');
    const rmEl = document.querySelector('#viewDashboard [data-stat="removed"]');

    if (totalEl) animateNumber(totalEl, 0, total, 900);
    if (gEl) animateNumber(gEl, 0, g, 900);
    if (ngEl) animateNumber(ngEl, 0, ng, 900);
    if (rmEl) animateNumber(rmEl, 0, rm, 900);

    const max = Math.max(g, ng, rm, 1);
    const gBar = document.querySelector('[data-fill="google"]');
    const ngBar = document.querySelector('[data-fill="nongoogle"]');
    const rmBar = document.querySelector('[data-fill="removed"]');
    if (gBar) gBar.style.width = `${(g / max) * 100}%`;
    if (ngBar) ngBar.style.width = `${(ng / max) * 100}%`;
    if (rmBar) rmBar.style.width = `${(rm / max) * 100}%`;

    if (latest) {
      const modeLabel = latest.mode === 'separator' ? 'Domain Separator' : 'Full Verification';
      els.dashLatestJob.innerHTML = `
        <div class="action-btn" style="cursor: default;">
          <div class="action-btn-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
          </div>
          <div class="action-btn-text">
            <span class="action-btn-title">${escapeHtml(latest.fileName || 'Untitled')}</span>
            <span class="action-btn-desc">${modeLabel} · ${fmtTimeAgo(latest.completedAt)} · ${fmtDuration(latest.durationMs)}</span>
          </div>
        </div>
      `;
    } else {
      els.dashLatestJob.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
          </div>
          <p class="empty-state-text">No jobs yet</p>
          <p class="empty-state-sub">Head to workspace to upload your first file</p>
        </div>
      `;
    }
  }

  // ============================================================
  // ACTIVITY RENDER
  // ============================================================
  function renderActivity() {
    const activity = getActivity();
    if (activity.length === 0) {
      els.activityContainer.innerHTML = `
        <div class="empty-state large">
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </div>
          <p class="empty-state-text">No activity yet</p>
          <p class="empty-state-sub">Your processing history will appear here after you run your first job</p>
        </div>
      `;
      return;
    }

    els.activityContainer.innerHTML = `<div class="activity-list">${activity.map((entry, i) => {
      const isSep = entry.mode === 'separator';
      const iconClass = isSep ? 'mode-separator' : '';
      const modeLabel = isSep ? 'Separator' : 'Full';

      let statsHtml;
      if (isSep) {
        statsHtml = `
          <span class="activity-item-stat">Business <strong>${fmt(entry.stats.business || 0)}</strong></span>
          <span class="activity-item-stat">Consumer <strong>${fmt(entry.stats.consumer || 0)}</strong></span>
          <span class="activity-item-stat">Google <strong>${fmt(entry.stats.googleWorkspace || 0)}</strong></span>
        `;
      } else {
        statsHtml = `
          <span class="activity-item-stat">Google <strong>${fmt(entry.stats.googleWorkspace || 0)}</strong></span>
          <span class="activity-item-stat">Other <strong>${fmt(entry.stats.nonGoogle || 0)}</strong></span>
          <span class="activity-item-stat">Removed <strong>${fmt(entry.stats.removed || 0)}</strong></span>
        `;
      }

      const iconSvg = isSep
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/><line x1="12" y1="3" x2="12" y2="21"/></svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;

      return `
      <div class="activity-item" style="animation-delay: ${i * 0.04}s;">
        <div class="activity-item-icon ${iconClass}">${iconSvg}</div>
        <div class="activity-item-info">
          <span class="activity-item-name">${escapeHtml(entry.fileName || 'Untitled')}</span>
          <span class="activity-item-meta">${modeLabel} · ${fmtDuration(entry.durationMs)}</span>
        </div>
        <div class="activity-item-stats">${statsHtml}</div>
        <div class="activity-item-time">${fmtTimeAgo(entry.completedAt)}</div>
      </div>
      `;
    }).join('')}</div>`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str || '');
    return div.innerHTML;
  }

  // ============================================================
  // INIT
  // ============================================================
  setWorkspaceState('upload');
  setSepState('upload');
  setView('dashboard');
  console.log('[APP] Tidy Mail initialized');

})();