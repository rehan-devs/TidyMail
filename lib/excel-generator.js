'use strict';

const XLSX = require('xlsx');
const { CATEGORIES, CATEGORY_LABELS } = require('./categorizer');

// ============================================================
// STYLES CACHE (Flyweight Pattern)
// ============================================================
function makeHeaderStyle() {
  return {
    font: { bold: true, color: { rgb: 'F0F0F2' }, sz: 11 },
    fill: { fgColor: { rgb: '111113' }, patternType: 'solid' },
    alignment: { horizontal: 'left', vertical: 'center', wrapText: false },
    border: {
      bottom: { style: 'thin', color: { rgb: '222225' } },
    },
  };
}

function makeDataStyle(shade) {
  return {
    font: { color: { rgb: shade ? 'CCCCCC' : 'F0F0F2' }, sz: 10 },
    fill: shade
      ? { fgColor: { rgb: '161618' }, patternType: 'solid' }
      : { fgColor: { rgb: '111113' }, patternType: 'solid' },
    alignment: { horizontal: 'left', vertical: 'center' },
  };
}

const HEADER_STYLE = makeHeaderStyle();
const DATA_STYLE_NORMAL = makeDataStyle(false);
const DATA_STYLE_SHADED = makeDataStyle(true);

// Cache for Column index-to-letter references
const colNamesCache = [];
function getColName(colIdx) {
  if (colNamesCache[colIdx]) return colNamesCache[colIdx];
  let name = '';
  let temp = colIdx;
  while (temp >= 0) {
    name = String.fromCharCode((temp % 26) + 65) + name;
    temp = Math.floor(temp / 26) - 1;
  }
  colNamesCache[colIdx] = name;
  return name;
}

function styleSheet(ws) {
  if (!ws['!ref']) return;
  const range = XLSX.utils.decode_range(ws['!ref']);
  const maxR = range.e.r;
  const maxC = range.e.c;

  for (let C = range.s.c; C <= maxC; C++) {
    const colName = getColName(C);
    // Header styling
    const headerCell = colName + '1';
    if (ws[headerCell]) ws[headerCell].s = HEADER_STYLE;

    // Data styling (Uses Flyweight references)
    for (let R = 1; R <= maxR; R++) {
      const cellRef = colName + (R + 1);
      if (ws[cellRef]) {
        ws[cellRef].s = (R % 2 === 0) ? DATA_STYLE_SHADED : DATA_STYLE_NORMAL;
      }
    }
  }
}

function setColWidths(ws, widths) {
  ws['!cols'] = widths.map(w => ({ wch: w }));
}

function addAutoFilter(ws) {
  if (!ws['!ref']) return;
  ws['!autofilter'] = { ref: ws['!ref'] };
}

function freezeTopRow(ws) {
  ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft' };
}

const STANDARD_HEADERS = [
  'Email (Final)',
  'Original Email',
  'Provider',
  'Domain',
  'MX Record',
  'Is Google',
  'Is Trade-Based',
  'Trade Keyword',
  'Is Role-Based',
  'Is Catch-All',
  'Catch-All Confidence',
  'TLD Fixed',
  'Modifications',
  'Notes',
];

const STANDARD_WIDTHS = [32, 32, 22, 28, 38, 12, 15, 18, 15, 14, 18, 12, 45, 55];

function recordToStandardRow(r) {
  const dns = r.dnsResult || {};
  const tags = (r.categorization && r.categorization.tags) || {};
  const mx = (dns.mxRecords && dns.mxRecords[0]) ? dns.mxRecords[0].exchange : 'N/A';
  const mods = (r.cleanModifications || []).join('; ');

  return [
    r.cleaned || r.original,
    r.original !== r.cleaned ? r.original : '',
    dns.provider || 'Unknown',
    r.domain || '',
    mx,
    dns.isGoogle ? 'Yes' : 'No',
    tags.isTradeBased ? 'Yes' : 'No',
    tags.tradeKeyword || '',
    tags.isRoleBased ? 'Yes' : 'No',
    tags.isCatchAll ? 'Yes' : 'No',
    tags.catchAllConfidence || '',
    r.tldFixed ? `${r.originalTLD} to ${r.fixedTLD}` : '',
    mods,
    (r.categorization && r.categorization.notes) || '',
  ];
}

// ============================================================
// SHEET BUILDERS
// ============================================================

function buildSummarySheet(stats, fileName, durationMs) {
  const duration = durationMs ? `${Math.round(durationMs / 1000)}s` : 'N/A';
  const totalProcessed = stats.total || 0;
  const pct = (n) => totalProcessed > 0
    ? `${((n / totalProcessed) * 100).toFixed(1)}%`
    : '0.0%';
  const totalKept = (stats.googleWorkspace || 0) + (stats.nonGoogle || 0);

  const rows = [
    ['Metric', 'Count', 'Percentage', 'Notes'],
    ['', '', '', ''],
    ['FILE INFORMATION', '', '', ''],
    ['Source File', fileName || 'N/A', '', ''],
    ['Processing Time', duration, '', ''],
    ['Processed At', new Date().toISOString(), '', ''],
    ['', '', '', ''],
    ['TOTALS', '', '', ''],
    ['Total Emails Found', totalProcessed, '100%', 'All email candidates extracted'],
    ['Total Kept (Usable)', totalKept, pct(totalKept), 'Google + Non-Google combined'],
    ['Total Removed', stats.removed || 0, pct(stats.removed || 0), 'All removal reasons'],
    ['Needs Review', stats.needsReview || 0, pct(stats.needsReview || 0), 'Requires manual verification'],
    ['', '', '', ''],
    ['PRIMARY CATEGORIES (mutually exclusive)', '', '', ''],
    ['Google Workspace', stats.googleWorkspace || 0, pct(stats.googleWorkspace || 0), 'MX records point to Google'],
    ['Non-Google', stats.nonGoogle || 0, pct(stats.nonGoogle || 0), 'Other verified providers'],
    ['Disposable', stats.disposable || 0, pct(stats.disposable || 0), 'Known disposable email services'],
    ['Removed', stats.removed || 0, pct(stats.removed || 0), 'All removal reasons combined'],
    ['', '', '', ''],
    ['TAGS (based on local part only)', '', '', ''],
    ['Trade-Based (all)', stats.tradeBased || 0, pct(stats.tradeBased || 0), 'Trade keywords in LOCAL PART (username)'],
    ['Role-Based (all)', stats.roleBased || 0, pct(stats.roleBased || 0), 'info@, admin@, etc. (local part)'],
    ['Catch-All Signal (all)', stats.catchAll || 0, pct(stats.catchAll || 0), 'DNS heuristic, not confirmed'],
    ['Fixed (all)', stats.fixed || 0, pct(stats.fixed || 0), 'TLD or format corrections'],
    ['', '', '', ''],
    ['CROSS-BREAKDOWN', '', '', ''],
    ['Google Workspace + Trade-Based', stats.googleWorkspaceTradeBased || 0, pct(stats.googleWorkspaceTradeBased || 0), 'Trade username on Google MX'],
    ['Google Workspace + Role-Based', stats.googleWorkspaceRoleBased || 0, pct(stats.googleWorkspaceRoleBased || 0), 'Role username on Google MX'],
    ['Google Workspace + Catch-All', stats.googleWorkspaceCatchAll || 0, pct(stats.googleWorkspaceCatchAll || 0), 'Google MX with catch-all signals'],
    ['Non-Google + Trade-Based', stats.nonGoogleTradeBased || 0, pct(stats.nonGoogleTradeBased || 0), 'Trade username on other providers'],
    ['Non-Google + Role-Based', stats.nonGoogleRoleBased || 0, pct(stats.nonGoogleRoleBased || 0), 'Role username on other providers'],
    ['Non-Google + Catch-All', stats.nonGoogleCatchAll || 0, pct(stats.nonGoogleCatchAll || 0), 'Other providers with catch-all signals'],
    ['', '', '', ''],
    ['NOTES', '', '', ''],
    ['Trade vs Role Detection', 'Local part only', '', 'Detection scans only the part BEFORE @ so a person on a construction company domain is not automatically tagged as trade unless their username indicates it'],
    ['Sheet Separation', 'Mutually exclusive tag sheets', '', 'Trade sheets EXCLUDE role-based. Role sheets EXCLUDE trade-based. This prevents overlap'],
    ['Catch-All Detection', 'Heuristic Only', '', 'DNS-based signals, not SMTP verification'],
    ['Deduplication', 'Applied', '', 'Case-insensitive duplicate removal'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 42 }, { wch: 18 }, { wch: 14 }, { wch: 60 }];
  styleSheet(ws);
  freezeTopRow(ws);
  return ws;
}

function buildFilteredSheet(records, predicate) {
  const filtered = records.filter(r => r.categorization && predicate(r));
  if (filtered.length === 0) return null; // Avoid allocating memory for empty sheets

  const rows = [STANDARD_HEADERS];
  for (let i = 0; i < filtered.length; i++) {
    rows.push(recordToStandardRow(filtered[i]));
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  setColWidths(ws, STANDARD_WIDTHS);
  styleSheet(ws);
  addAutoFilter(ws);
  freezeTopRow(ws);
  return ws;
}

function buildRemovedSheet(records) {
  const headers = [
    'Original Email',
    'Cleaned Attempt',
    'Reason Removed',
    'Category',
    'Stage',
    'Domain',
  ];

  const removedCategories = new Set([
    CATEGORIES.REMOVED_FILTER_WORD,
    CATEGORIES.REMOVED_BLOCKED_TLD,
    CATEGORIES.REMOVED_INVALID_FORMAT,
    CATEGORIES.REMOVED_DOMAIN_NOT_FOUND,
    CATEGORIES.REMOVED_NO_MX,
  ]);

  const filtered = records.filter(r =>
    r.categorization && removedCategories.has(r.categorization.category)
  );
  if (filtered.length === 0) return null;

  const rows = [headers];
  for (let i = 0; i < filtered.length; i++) {
    const r = filtered[i];
    const stage = r.cleanStatus === 'removed'
      ? 'Cleaning'
      : !r.validationResult || !r.validationResult.isValid
        ? 'Validation'
        : r.dnsResult && !r.dnsResult.exists
          ? 'DNS Check'
          : r.dnsResult && !r.dnsResult.hasMX
            ? 'MX Check'
            : 'Unknown';

    rows.push([
      r.original || '',
      r.cleaned || '',
      r.categorization.reason || '',
      CATEGORY_LABELS[r.categorization.category] || '',
      stage,
      r.domain || '',
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  setColWidths(ws, [38, 38, 55, 25, 15, 28]);
  styleSheet(ws);
  addAutoFilter(ws);
  freezeTopRow(ws);
  return ws;
}

function buildDisposableSheet(records) {
  const headers = ['Original Email', 'Domain', 'Reason', 'Notes'];

  const filtered = records.filter(r =>
    r.categorization && r.categorization.category === CATEGORIES.DISPOSABLE
  );
  if (filtered.length === 0) return null;

  const rows = [headers];
  for (let i = 0; i < filtered.length; i++) {
    const r = filtered[i];
    rows.push([
      r.original || '',
      r.domain || '',
      r.categorization.reason || 'Known disposable',
      r.categorization.notes || '',
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  setColWidths(ws, [38, 30, 50, 45]);
  styleSheet(ws);
  addAutoFilter(ws);
  freezeTopRow(ws);
  return ws;
}

function buildNeedsReviewSheet(records) {
  const headers = [
    'Email (Final)',
    'Original Email',
    'Concern',
    'Modifications',
    'Domain',
    'Domain Exists',
    'Has MX',
    'Recommendation',
  ];

  const filtered = records.filter(r =>
    r.categorization && r.categorization.category === CATEGORIES.NEEDS_REVIEW
  );
  if (filtered.length === 0) return null;

  const rows = [headers];
  for (let i = 0; i < filtered.length; i++) {
    const r = filtered[i];
    const dns = r.dnsResult || {};
    const tags = (r.categorization && r.categorization.tags) || {};
    const mods = (r.cleanModifications || []).join('; ');

    let recommendation = 'Manual review required';
    if (tags.hasLeadingPhone) recommendation = 'Verify - phone number prefix';
    if (tags.hasNumericOnly) recommendation = 'Verify - numeric-only local part';
    if (r.tldNeedsReview) recommendation = 'Verify TLD - could not auto-correct';
    if (tags.hasSuspicious20) recommendation = 'Verify - URL encoding artifact';

    rows.push([
      r.cleaned || r.original,
      r.original !== r.cleaned ? r.original : '',
      r.categorization.reason || '',
      mods,
      r.domain || '',
      dns.exists ? 'Yes' : 'No',
      dns.hasMX ? 'Yes' : 'No',
      recommendation,
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  setColWidths(ws, [32, 32, 45, 45, 28, 14, 10, 45]);
  styleSheet(ws);
  addAutoFilter(ws);
  freezeTopRow(ws);
  return ws;
}

function buildFullLogSheet(records) {
  const headers = [
    'Original',
    'Final Email',
    'Status',
    'Primary Category',
    'Category Label',
    'Is Trade-Based',
    'Trade Keyword',
    'Is Role-Based',
    'Is Catch-All',
    'Is Fixed',
    'MX Provider',
    'Domain',
    'Domain Exists',
    'Has MX',
    'Is Google',
    'Catch-All Confidence',
    'TLD Original',
    'TLD Fixed To',
    'Modifications',
    'Validation Issues',
    'Notes',
  ];

  const rows = [headers];

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const dns = r.dnsResult || {};
    const cat = r.categorization || {};
    const tags = cat.tags || {};
    const mods = (r.cleanModifications || []).join('; ');
    const valIssues = (r.validationResult && r.validationResult.issues || []).join('; ');

    rows.push([
      r.original || '',
      r.cleaned || '',
      r.cleanStatus || '',
      cat.category || 'uncategorized',
      CATEGORY_LABELS[cat.category] || cat.category || '',
      tags.isTradeBased ? 'Yes' : 'No',
      tags.tradeKeyword || '',
      tags.isRoleBased ? 'Yes' : 'No',
      tags.isCatchAll ? 'Yes' : 'No',
      tags.isFixed ? 'Yes' : 'No',
      dns.provider || '',
      r.domain || '',
      dns.exists ? 'Yes' : 'No',
      dns.hasMX ? 'Yes' : 'No',
      dns.isGoogle ? 'Yes' : 'No',
      tags.catchAllConfidence || '',
      r.originalTLD || '',
      r.fixedTLD || '',
      mods,
      valIssues,
      cat.notes || '',
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  setColWidths(ws, [
    35, 35, 12, 22, 25, 14, 18, 14, 14, 12,
    22, 28, 14, 10, 12, 18, 15, 15, 45, 45, 55,
  ]);
  styleSheet(ws);
  addAutoFilter(ws);
  freezeTopRow(ws);
  return ws;
}

/**
 * Helper to append non-null worksheets to the workbook
 */
function appendSheet(wb, ws, name) {
  if (ws) XLSX.utils.book_append_sheet(wb, ws, name);
}

/**
 * Main Excel generation
 */
function generateExcel(records, stats, outputPath, fileName, durationMs) {
  console.log(`[EXCEL] Generating Excel file with ${records.length} records`);

  const wb = XLSX.utils.book_new();

  // Sheet 1: Summary
  XLSX.utils.book_append_sheet(wb, buildSummarySheet(stats, fileName, durationMs), 'Summary');

  // ============================================================
  // GOOGLE WORKSPACE SHEETS
  // ============================================================
  appendSheet(wb, buildFilteredSheet(records, r => r.categorization.category === CATEGORIES.GOOGLE_WORKSPACE), 'Google Workspace');
  appendSheet(wb, buildFilteredSheet(records, r =>
    r.categorization.category === CATEGORIES.GOOGLE_WORKSPACE &&
    !r.categorization.tags.isTradeBased &&
    !r.categorization.tags.isRoleBased &&
    !r.categorization.tags.isCatchAll
  ), 'Google - Clean');
  appendSheet(wb, buildFilteredSheet(records, r =>
    r.categorization.category === CATEGORIES.GOOGLE_WORKSPACE &&
    r.categorization.tags.isTradeBased &&
    !r.categorization.tags.isRoleBased
  ), 'Google - Trade');
  appendSheet(wb, buildFilteredSheet(records, r =>
    r.categorization.category === CATEGORIES.GOOGLE_WORKSPACE &&
    r.categorization.tags.isRoleBased &&
    !r.categorization.tags.isTradeBased
  ), 'Google - Role');
  appendSheet(wb, buildFilteredSheet(records, r =>
    r.categorization.category === CATEGORIES.GOOGLE_WORKSPACE &&
    r.categorization.tags.isRoleBased &&
    r.categorization.tags.isTradeBased
  ), 'Google - Role+Trade');
  appendSheet(wb, buildFilteredSheet(records, r =>
    r.categorization.category === CATEGORIES.GOOGLE_WORKSPACE &&
    r.categorization.tags.isCatchAll
  ), 'Google - CatchAll');

  // ============================================================
  // NON-GOOGLE SHEETS
  // ============================================================
  appendSheet(wb, buildFilteredSheet(records, r => r.categorization.category === CATEGORIES.NON_GOOGLE), 'Non-Google');
  appendSheet(wb, buildFilteredSheet(records, r =>
    r.categorization.category === CATEGORIES.NON_GOOGLE &&
    !r.categorization.tags.isTradeBased &&
    !r.categorization.tags.isRoleBased &&
    !r.categorization.tags.isCatchAll
  ), 'Non-Google - Clean');
  appendSheet(wb, buildFilteredSheet(records, r =>
    r.categorization.category === CATEGORIES.NON_GOOGLE &&
    r.categorization.tags.isTradeBased &&
    !r.categorization.tags.isRoleBased
  ), 'Non-Google - Trade');
  appendSheet(wb, buildFilteredSheet(records, r =>
    r.categorization.category === CATEGORIES.NON_GOOGLE &&
    r.categorization.tags.isRoleBased &&
    !r.categorization.tags.isTradeBased
  ), 'Non-Google - Role');
  appendSheet(wb, buildFilteredSheet(records, r =>
    r.categorization.category === CATEGORIES.NON_GOOGLE &&
    r.categorization.tags.isRoleBased &&
    r.categorization.tags.isTradeBased
  ), 'Non-Google - Role+Trade');
  appendSheet(wb, buildFilteredSheet(records, r =>
    r.categorization.category === CATEGORIES.NON_GOOGLE &&
    r.categorization.tags.isCatchAll
  ), 'Non-Google - CatchAll');

  // ============================================================
  // ALL-TAG SHEETS
  // ============================================================
  appendSheet(wb, buildFilteredSheet(records, r =>
    r.categorization.tags &&
    r.categorization.tags.isTradeBased &&
    !r.categorization.tags.isRoleBased
  ), 'All Trade-Based');
  appendSheet(wb, buildFilteredSheet(records, r =>
    r.categorization.tags &&
    r.categorization.tags.isRoleBased &&
    !r.categorization.tags.isTradeBased
  ), 'All Role-Based');

  // ============================================================
  // REMOVED / DISPOSABLE / REVIEW
  // ============================================================
  appendSheet(wb, buildRemovedSheet(records), 'Removed');
  appendSheet(wb, buildDisposableSheet(records), 'Disposable');
  appendSheet(wb, buildNeedsReviewSheet(records), 'Needs Review');

  // ============================================================
  // FULL AUDIT LOG
  // ============================================================
  appendSheet(wb, buildFullLogSheet(records), 'Full Log');

  XLSX.writeFile(wb, outputPath, {
    bookType: 'xlsx',
    type: 'file',
    compression: true,
  });

  console.log(`[EXCEL] File written to: ${outputPath}`);
  return outputPath;
}

module.exports = { generateExcel };