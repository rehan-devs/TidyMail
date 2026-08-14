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
        let value = '';
        while (pos < len) {
          if (text[pos] === '"') {
            if (text[pos + 1] === '"') {
              // Escaped quote
              value += '"';
              pos += 2;
            } else {
              pos++; // skip closing quote
              break;
            }
          } else {
            value += text[pos];
            pos++;
          }
        }
        row.push(value);
        // Skip comma or end of line
        if (pos < len && text[pos] === ',') pos++;
        else if (pos < len && (text[pos] === '\r' || text[pos] === '\n')) break;
      } else {
        // Unquoted field
        let value = '';
        while (pos < len && text[pos] !== ',' && text[pos] !== '\r' && text[pos] !== '\n') {
          value += text[pos];
          pos++;
        }
        row.push(value.trim());
        if (pos < len && text[pos] === ',') pos++;
        else if (pos < len && (text[pos] === '\r' || text[pos] === '\n')) break;
      }
    }

    // Skip line ending
    if (pos < len && text[pos] === '\r' && text[pos + 1] === '\n') pos += 2;
    else if (pos < len && text[pos] === '\r') pos += 1;
    else if (pos < len && text[pos] === '\n') pos += 1;

    // Add non-empty cells
    for (const cell of row) {
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

  for (const cell of cells) {
    // Try direct regex match on cell
    const matches = cell.match(EMAIL_REGEX);
    if (matches) {
      for (const m of matches) {
        const lower = m.toLowerCase().trim();
        if (!seen.has(lower)) {
          seen.add(lower);
          found.push({ raw: m, source: cell });
        }
      }
    } else {
      // Maybe the cell IS an email but the regex didn't catch it
      // Try after basic cleanup
      const cleaned = cell.replace(/\s+/g, '').toLowerCase();
      const cleanedMatches = cleaned.match(EMAIL_REGEX);
      if (cleanedMatches) {
        for (const m of cleanedMatches) {
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

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
    for (const row of data) {
      for (const cell of row) {
        const val = String(cell || '').trim();
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
    // Try UTF-8 first, then latin1
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
    // Try as CSV anyway
    const text = buffer.toString('utf8');
    cells = parseCSV(text);
  }

  console.log(`[PARSER] Found ${cells.length} cells`);

  const emails = extractEmails(cells);
  console.log(`[PARSER] Extracted ${emails.length} email candidates`);

  return emails;
}

module.exports = { parseFile, parseCSV, extractEmails };