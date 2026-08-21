'use strict';

const XLSX = require('xlsx');

// ============================================================
// STYLES CACHE (Flyweight Pattern)
// ============================================================
function makeHeaderStyle() {
  return {
    font: { bold: true, color: { rgb: 'F0F0F2' }, sz: 11 },
    fill: { fgColor: { rgb: '111113' }, patternType: 'solid' },
    alignment: { horizontal: 'left', vertical: 'center' },
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
    // Header
    const headerCell = colName + '1';
    if (ws[headerCell]) ws[headerCell].s = HEADER_STYLE;

    // Data
    for (let R = 1; R <= maxR; R++) {
      const cellRef = colName + (R + 1);
      if (ws[cellRef]) {
        ws[cellRef].s = (R % 2 === 0) ? DATA_STYLE_SHADED : DATA_STYLE_NORMAL;
      }
    }
  }
}

function addAutoFilter(ws) {
  if (!ws['!ref']) return;
  ws['!autofilter'] = { ref: ws['!ref'] };
}

function freezeTopRow(ws) {
  ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft' };
}

function buildSummarySheet(businessRecords, consumerRecords, checkedGoogleMx, fileName, durationMs) {
  const duration = durationMs ? `${Math.round(durationMs / 1000)}s` : 'N/A';
  const total = businessRecords.length + consumerRecords.length;

  let googleBusiness = 0;
  let googleConsumer = 0;
  for (let i = 0; i < businessRecords.length; i++) {
    if (businessRecords[i].isGoogleWorkspace === 'Yes') googleBusiness++;
  }
  for (let i = 0; i < consumerRecords.length; i++) {
    if (consumerRecords[i].isGoogleWorkspace === 'Yes') googleConsumer++;
  }

  const pct = (n) => total > 0 ? `${((n / total) * 100).toFixed(1)}%` : '0.0%';

  const rows = [
    ['Metric', 'Value', 'Notes'],
    ['', '', ''],
    ['FILE INFORMATION', '', ''],
    ['Source File', fileName || 'N/A', ''],
    ['Processing Time', duration, ''],
    ['Processed At', new Date().toISOString(), ''],
    ['Mode', 'Domain Separator', 'Fast split by domain type (no cleaning)'],
    ['Google MX Check', checkedGoogleMx ? 'Yes' : 'No', checkedGoogleMx ? 'Included Google Workspace verification' : 'Skipped for speed'],
    ['', '', ''],
    ['TOTALS', '', ''],
    ['Total Unique Emails', total, '100%'],
    ['Business Domains', businessRecords.length, pct(businessRecords.length)],
    ['Consumer Domains', consumerRecords.length, pct(consumerRecords.length)],
    ['', '', ''],
  ];

  if (checkedGoogleMx) {
    rows.push(['GOOGLE WORKSPACE BREAKDOWN', '', '']);
    rows.push(['Google Workspace (Business)', googleBusiness, `Of ${businessRecords.length} business emails`]);
    rows.push(['Google Workspace (Consumer)', googleConsumer, `Of ${consumerRecords.length} consumer emails`]);
    rows.push(['Google Workspace (Total)', googleBusiness + googleConsumer, `Total emails on Google MX`]);
    rows.push(['', '', '']);
  }

  rows.push(['CONSUMER DETECTION', '', '']);
  rows.push(['Keywords Matched', 'gmail, hotmail, yahoo, aol., msn., icloud', 'Substring match on domain']);
  rows.push(['', '', '']);
  rows.push(['NOTES', '', '']);
  rows.push(['Filter Usage', 'Apply Excel filters', 'Use auto-filter on Google Workspace column to isolate emails']);
  rows.push(['Deduplication', 'Applied', 'Duplicate emails were removed (case-insensitive)']);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 32 }, { wch: 40 }, { wch: 50 }];
  styleSheet(ws);
  freezeTopRow(ws);
  return ws;
}

function buildRecordSheet(records) {
  const headers = ['Email', 'Domain', 'Google Workspace'];
  const rows = [headers];

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    rows.push([r.email, r.domain, r.isGoogleWorkspace || 'Not Checked']);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 40 }, { wch: 32 }, { wch: 20 }];
  styleSheet(ws);
  addAutoFilter(ws);
  freezeTopRow(ws);
  return ws;
}

function generateSeparatorExcel({ businessRecords, consumerRecords, checkedGoogleMx, fileName, durationMs, outputPath }) {
  console.log(`[EXCEL-SEP] Building Excel with ${businessRecords.length} business + ${consumerRecords.length} consumer`);

  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb,
    buildSummarySheet(businessRecords, consumerRecords, checkedGoogleMx, fileName, durationMs),
    'Summary'
  );

  if (businessRecords.length > 0) {
    XLSX.utils.book_append_sheet(wb, buildRecordSheet(businessRecords), 'Business Domains');
  }
  if (consumerRecords.length > 0) {
    XLSX.utils.book_append_sheet(wb, buildRecordSheet(consumerRecords), 'Consumer Domains');
  }

  XLSX.writeFile(wb, outputPath, {
    bookType: 'xlsx',
    type: 'file',
    compression: true,
  });

  console.log(`[EXCEL-SEP] Written: ${outputPath}`);
  return outputPath;
}

module.exports = { generateSeparatorExcel };