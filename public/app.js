'use strict';

/* ============================================================
   TIDY MAIL - DASHBOARD CONTROLLER
   ============================================================ */

(function () {

  const app = document.getElementById('app');

  let currentView = 'dashboard';
  let workspaceState = 'upload';
  let currentJobId = null;
  let pollInterval = null;
  let selectedFile = null;
  let lastStats = {};
  let lastProgress = 0;
  let hasSavedCurrentJob = false;  // Dedup guard
  const ACTIVITY_KEY = 'tidymail_activity';

  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);

  const els = {
    navItems: $$('.nav-item'),
    breadcrumbCurrent: $('#breadcrumbCurrent'),

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

    dashGoWorkspace: $('#dashGoWorkspace'),
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
    els.navItems.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });
    const labels = { dashboard: 'Dashboard', workspace: 'Workspace', activity: 'Activity Logs' };
    els.breadcrumbCurrent.textContent = labels[view] || view;
    if (view === 'dashboard') renderDashboard();
    if (view === 'activity') renderActivity();
  }

  els.navItems.forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.view)));
  els.dashGoWorkspace.addEventListener('click', () => setView('workspace'));
  els.dashGoActivity.addEventListener('click', () => setView('activity'));

  // ============================================================
  // WORKSPACE SUBSTATES
  // ============================================================
  function setWorkspaceState(state) {
    workspaceState = state;
    [els.wsUpload, els.wsProcessing, els.wsComplete, els.wsError].forEach(el => el.classList.remove('active'));
    const map = { upload: els.wsUpload, processing: els.wsProcessing, complete: els.wsComplete, error: els.wsError };
    if (map[state]) map[state].classList.add('active');
  }

  // ============================================================
  // NUMBER ANIMATION
  // ============================================================
  function easeOutExpo(t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); }

  function animateNumber(el, from, to, duration = 800) {
    if (from === to) { el.textContent = fmt(to); return; }
    const start = performance.now();
    const diff = to - from;
    function tick(now) {
      const p = Math.min((now - start) / duration, 1);
      el.textContent = fmt(Math.round(from + diff * easeOutExpo(p)));
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
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
  // FILE UPLOAD
  // ============================================================
  els.uploadZone.addEventListener('click', () => els.fileInput.click());

  els.uploadZone.addEventListener('mousemove', (e) => {
    const rect = els.uploadZone.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    els.uploadZone.style.setProperty('--mx', x + '%');
    els.uploadZone.style.setProperty('--my', y + '%');
  });

  els.uploadZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      els.fileInput.click();
    }
  });

  els.fileInput.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) selectFile(f);
  });

  ['dragenter', 'dragover'].forEach(ev => {
    els.uploadZone.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation();
      els.uploadZone.classList.add('drag-over');
    });
  });

  els.uploadZone.addEventListener('dragleave', (e) => {
    e.preventDefault(); e.stopPropagation();
    const r = els.uploadZone.getBoundingClientRect();
    if (e.clientX <= r.left || e.clientX >= r.right || e.clientY <= r.top || e.clientY >= r.bottom) {
      els.uploadZone.classList.remove('drag-over');
    }
  });

  els.uploadZone.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation();
    els.uploadZone.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f) selectFile(f);
  });

  document.body.addEventListener('dragover', e => e.preventDefault());
  document.body.addEventListener('drop', e => e.preventDefault());

  els.filePreviewClear.addEventListener('click', (e) => { e.stopPropagation(); clearFile(); });

  function selectFile(file) {
    const validExts = ['.csv', '.xls', '.xlsx'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!validExts.includes(ext)) {
      showError('Invalid file type. Please upload CSV, XLS, or XLSX.');
      return;
    }
    selectedFile = file;
    els.filePreviewName.textContent = file.name;
    els.filePreviewSize.textContent = fmtBytes(file.size);
    els.filePreview.classList.add('visible');
    els.uploadSubmit.disabled = false;
  }

  function clearFile() {
    selectedFile = null;
    els.fileInput.value = '';
    els.filePreview.classList.remove('visible');
    els.uploadSubmit.disabled = true;
  }

  // ============================================================
  // UPLOAD SUBMIT
  // ============================================================
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
      hasSavedCurrentJob = false;  // Reset dedup flag for new job

      resetProcessingUI();
      setWorkspaceState('processing');
      startPolling();
    } catch (err) {
      showError(err.message || 'Failed to upload file.');
      els.uploadSubmit.disabled = false;
    }
  });

  // ============================================================
  // POLLING
  // ============================================================
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
          saveToActivity(status);
          hasSavedCurrentJob = true;
        }
        showComplete(status);
      } else if (status.status === 'error') {
        stopPolling();
        showError(status.error || 'Processing failed.');
      }
    } catch (_) {}
  }

  // ============================================================
  // PROCESSING UI
  // ============================================================
  const STAGE_ORDER = ['parsing', 'cleaning', 'fixing', 'validating', 'dns', 'mx', 'categorizing', 'complete'];

  function resetProcessingUI() {
    els.processCount.textContent = '0';
    els.processTotal.textContent = 'of 0';
    els.processStep.textContent = 'Starting up...';
    els.progressFill.style.width = '0%';
    lastStats = {};
    lastProgress = 0;
    $$('.pipeline-dot').forEach(d => d.classList.remove('completed', 'active'));
    ['liveGoogle', 'liveNonGoogle', 'liveRemoved', 'liveReview'].forEach(k => els[k].textContent = '0');
    els.pencilLoader.classList.remove('visible');
  }

  function updateProcessingUI(status) {
    els.processStep.textContent = status.currentStep || 'Processing...';
    const p = status.progress || 0, t = status.total || 0;

    if (p !== lastProgress) {
      animateNumber(els.processCount, lastProgress, p, 600);
      lastProgress = p;
    }
    els.processTotal.textContent = `of ${fmt(t)}`;
    els.progressFill.style.width = t > 0 ? `${Math.min((p / t) * 100, 100)}%` : '0%';

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
    if (from !== to) animateNumber(el, from, to, 500);
  }

  function updatePipelineDots(status) {
    const idx = STAGE_ORDER.indexOf(status);
    if (idx === -1) return;
    $$('.pipeline-dot').forEach(dot => {
      const di = STAGE_ORDER.indexOf(dot.dataset.stage);
      dot.classList.remove('completed', 'active');
      if (di < idx) dot.classList.add('completed');
      else if (di === idx) dot.classList.add('active');
    });
  }

  // ============================================================
  // COMPLETE
  // ============================================================
  function showComplete(status) {
    const dur = fmtDuration(status.durationMs);
    els.completeMeta.textContent = `Processed ${status.fileName || 'your file'}${dur ? ' in ' + dur : ''}`;
    const stats = status.stats || {};
    $$('#wsComplete .result-card-number').forEach(el => {
      const key = el.dataset.stat;
      const val = stats[key] || 0;
      setTimeout(() => animateNumber(el, 0, val, 1200), 100);
    });
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
    clearFile();
    resetProcessingUI();
    setWorkspaceState('upload');
  });

  // ============================================================
  // ERROR
  // ============================================================
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
    clearFile();
    resetProcessingUI();
    setWorkspaceState('upload');
  });

  // ============================================================
  // ACTIVITY (with dedup by jobId)
  // ============================================================
  function saveToActivity(status) {
    try {
      const activity = getActivity();

      // Dedup: if this jobId already exists in activity, do NOT add again
      if (status.jobId && activity.some(entry => entry.jobId === status.jobId)) {
        return;
      }

      const entry = {
        jobId: status.jobId,
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

      // On read, also dedupe by jobId as safety measure for old data
      const seen = new Set();
      const deduped = [];
      for (const entry of parsed) {
        const key = entry.jobId || `${entry.fileName}-${entry.completedAt}`;
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(entry);
        }
      }
      return deduped;
    } catch (_) { return []; }
  }

  // ============================================================
  // DASHBOARD RENDER
  // ============================================================
  function renderDashboard() {
    const activity = getActivity();
    const latest = activity[0];

    const g = latest ? (latest.stats.googleWorkspace || 0) : 0;
    const ng = latest ? (latest.stats.nonGoogle || 0) : 0;
    const rm = latest ? (latest.stats.removed || 0) : 0;
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
            <span class="action-btn-desc">${fmtTimeAgo(latest.completedAt)} · ${fmtDuration(latest.durationMs)}</span>
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

    els.activityContainer.innerHTML = `<div class="activity-list">${activity.map((entry, i) => `
      <div class="activity-item" style="animation-delay: ${i * 0.04}s;">
        <div class="activity-item-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <div class="activity-item-info">
          <span class="activity-item-name">${escapeHtml(entry.fileName || 'Untitled')}</span>
          <span class="activity-item-meta">Duration ${fmtDuration(entry.durationMs)}</span>
        </div>
        <div class="activity-item-stats">
          <span class="activity-item-stat">Google <strong>${fmt(entry.stats.googleWorkspace || 0)}</strong></span>
          <span class="activity-item-stat">Other <strong>${fmt(entry.stats.nonGoogle || 0)}</strong></span>
          <span class="activity-item-stat">Removed <strong>${fmt(entry.stats.removed || 0)}</strong></span>
        </div>
        <div class="activity-item-time">${fmtTimeAgo(entry.completedAt)}</div>
      </div>
    `).join('')}</div>`;
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
  setView('dashboard');
  console.log('[APP] Tidy Mail initialized');

})();