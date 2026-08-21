'use strict';

/**
 * CSV/Excel parser built from scratch.
 * Extracts all email-like strings from any cell.
 */

const EMAIL_REGEX = /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}/g;

/**
 * Parse CSV text into array of cell values
 */
function parseCSV(text) {
  // Remove BOM if present
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }

  const cells = [];
  let pos = 0;
  const len = text.length;

  while (pos < len) {
    // Skip empty lines
    if (text[pos] === '\r' || text[pos] === '\n') {
      if (text[pos] === '\r' && text[pos + 1] === '\n') pos += 2;
      else pos += 1;
      continue;
    }

    // Parse a row
    const row = [];
    while (pos < len) {
      if (text[pos] === '"') {
        // Quoted field
        pos++; // skip opening quote
        const start = pos;
        let hasEscapedQuotes = false;
        while (pos < len) {
          if (text[pos] === '"') {
            if (pos + 1 < len && text[pos + 1] === '"') {
              // Escaped quote
              hasEscapedQuotes = true;
              pos += 2;
            } else {
              pos++; // skip closing quote
              break;
            }
          } else {
            pos++;
          }
        }
        let value = text.slice(start, pos - 1);
        if (hasEscapedQuotes) {
          value = value.replace(/""/g, '"');
        }
        row.push(value);
        // Skip comma or end of line
        if (pos < len && text[pos] === ',') pos++;
        else if (pos < len && (text[pos] === '\r' || text[pos] === '\n')) break;
      } else {
        // Unquoted field - Optimized with fast slicing instead of character concat loop
        const start = pos;
        while (pos < len && text[pos] !== ',' && text[pos] !== '\r' && text[pos] !== '\n') {
          pos++;
        }
        const value = text.slice(start, pos).trim();
        row.push(value);
        if (pos < len && text[pos] === ',') pos++;
        else if (pos < len && (text[pos] === '\r' || text[pos] === '\n')) break;
      }
    }

    // Skip line ending
    if (pos < len && text[pos] === '\r' && text[pos + 1] === '\n') pos += 2;
    else if (pos < len && text[pos] === '\r') pos += 1;
    else if (pos < len && text[pos] === '\n') pos += 1;

    // Add non-empty cells
    for (let i = 0; i < row.length; i++) {
      const cell = row[i];
      if (cell && cell.trim()) {
        cells.push(cell.trim());
      }
    }
  }

  return cells;
}

/**
 * Extract emails from array of cell strings
 */
function extractEmails(cells) {
  const found = [];
  const seen = new Set();

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    // Try direct regex match on cell
    const matches = cell.match(EMAIL_REGEX);
    if (matches) {
      for (let j = 0; j < matches.length; j++) {
        const m = matches[j];
        const lower = m.toLowerCase().trim();
        if (!seen.has(lower)) {
          seen.add(lower);
          found.push({ raw: m, source: cell });
        }
      }
    } else {
      // Try after basic cleanup
      const cleaned = cell.replace(/\s+/g, '').toLowerCase();
      const cleanedMatches = cleaned.match(EMAIL_REGEX);
      if (cleanedMatches) {
        for (let j = 0; j < cleanedMatches.length; j++) {
          const m = cleanedMatches[j];
          if (!seen.has(m)) {
            seen.add(m);
            found.push({ raw: m, source: cell });
          }
        }
      }
    }
  }

  return found;
}

/**
 * Parse Excel file using xlsx library
 */
function parseExcel(buffer) {
  const XLSX = require('xlsx');
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const cells = [];

  for (let i = 0; i < workbook.SheetNames.length; i++) {
    const sheetName = workbook.SheetNames[i];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
    for (let r = 0; r < data.length; r++) {
      const row = data[r];
      for (let c = 0; c < row.length; c++) {
        const val = String(row[c] || '').trim();
        if (val) cells.push(val);
      }
    }
  }

  return cells;
}

/**
 * Main parse function - accepts file buffer and extension
 */
function parseFile(buffer, ext) {
  console.log(`[PARSER] Parsing file with extension: ${ext}`);

  let cells = [];

  if (ext === '.csv') {
    let text;
    try {
      text = buffer.toString('utf8');
    } catch (e) {
      text = buffer.toString('latin1');
    }
    cells = parseCSV(text);
  } else if (ext === '.xlsx' || ext === '.xls') {
    cells = parseExcel(buffer);
  } else {
    const text = buffer.toString('utf8');
    cells = parseCSV(text);
  }

  console.log(`[PARSER] Found ${cells.length} cells`);

  const emails = extractEmails(cells);
  console.log(`[PARSER] Extracted ${emails.length} email candidates`);

  cells = null; // force GC deallocation of flat raw values
  return emails;
}

module.exports = { parseFile, parseCSV, extractEmails };