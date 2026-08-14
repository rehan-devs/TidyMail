'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

let IANA_TLDS = new Set();
let TLD_FIXES = {};
let VALID_UNUSUAL_TLDS = new Set();

function loadData() {
  try {
    const ianaContent = fs.readFileSync(path.join(DATA_DIR, 'iana-tlds.txt'), 'utf8');
    IANA_TLDS = new Set(
      ianaContent
        .split('\n')
        .map(l => l.trim().toLowerCase())
        .filter(l => l && !l.startsWith('#'))
        .map(l => '.' + l)
    );
    console.log(`[TLD-FIXER] Loaded ${IANA_TLDS.size} IANA TLDs`);
  } catch (e) {
    console.warn('[TLD-FIXER] Could not load iana-tlds.txt:', e.message);
  }

  try {
    const fixesContent = fs.readFileSync(path.join(DATA_DIR, 'tld-fixes.json'), 'utf8');
    TLD_FIXES = JSON.parse(fixesContent);
    console.log(`[TLD-FIXER] Loaded ${Object.keys(TLD_FIXES).length} TLD fixes`);
  } catch (e) {
    console.warn('[TLD-FIXER] Could not load tld-fixes.json:', e.message);
  }

  try {
    const unusualContent = fs.readFileSync(path.join(DATA_DIR, 'valid-unusual-tlds.txt'), 'utf8');
    VALID_UNUSUAL_TLDS = new Set(
      unusualContent
        .split('\n')
        .map(l => l.trim().toLowerCase())
        .filter(l => l && !l.startsWith('#'))
        .map(l => l.startsWith('.') ? l : '.' + l)
    );
    console.log(`[TLD-FIXER] Loaded ${VALID_UNUSUAL_TLDS.size} valid unusual TLDs`);
  } catch (e) {
    console.warn('[TLD-FIXER] Could not load valid-unusual-tlds.txt:', e.message);
  }
}

loadData();

/**
 * Levenshtein distance - built from scratch, no library
 */
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;

  // Create matrix
  const dp = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = new Array(n + 1).fill(0);
    dp[i][0] = i;
  }
  for (let j = 0; j <= n; j++) {
    dp[0][j] = j;
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j],     // deletion
          dp[i][j - 1],     // insertion
          dp[i - 1][j - 1]  // substitution
        );
      }
    }
  }

  return dp[m][n];
}

/**
 * Extract TLD from domain, handling multi-part TLDs like .co.uk, .com.au
 */
function extractTLD(domain) {
  const lower = domain.toLowerCase();
  const parts = lower.split('.');

  if (parts.length < 2) return { tld: '', baseDomain: domain, isMultiPart: false };

  // Check for known multi-part TLDs (2-part like co.uk, com.au, org.uk etc.)
  if (parts.length >= 3) {
    const lastTwo = '.' + parts[parts.length - 2] + '.' + parts[parts.length - 1];
    const knownMultiParts = new Set([
      '.co.uk', '.co.nz', '.co.za', '.co.in', '.co.jp', '.co.ke',
      '.com.au', '.com.br', '.com.ar', '.com.mx', '.com.sg',
      '.com.my', '.com.hk', '.com.ng', '.com.ph', '.com.pk',
      '.net.au', '.net.nz', '.org.uk', '.org.au', '.org.nz',
      '.gov.uk', '.gov.au', '.gov.in', '.gov.sg', '.gov.nz',
      '.edu.au', '.edu.sg', '.edu.my',
      '.ac.uk', '.ac.nz', '.ac.za',
    ]);
    if (knownMultiParts.has(lastTwo)) {
      const tld = lastTwo;
      const baseDomain = parts.slice(0, parts.length - 2).join('.');
      return { tld, baseDomain, isMultiPart: true };
    }
  }

  // Single-part TLD
  const tld = '.' + parts[parts.length - 1];
  const baseDomain = parts.slice(0, parts.length - 1).join('.');
  return { tld, baseDomain, isMultiPart: false };
}

/**
 * Regex-based quick fixes (from your Python reference)
 */
const REGEX_FIXES = [
  { pattern: /\.commom$/i, replacement: '.com', note: 'Fixed .commom to .com' },
  { pattern: /\.coom$/i, replacement: '.com', note: 'Fixed .coom to .com' },
  { pattern: /\.comm$/i, replacement: '.com', note: 'Fixed .comm to .com' },
  { pattern: /\.cmo$/i, replacement: '.com', note: 'Fixed .cmo to .com' },
  { pattern: /\.ocm$/i, replacement: '.com', note: 'Fixed .ocm to .com' },
  { pattern: /\.vom$/i, replacement: '.com', note: 'Fixed .vom to .com' },
  { pattern: /\.xom$/i, replacement: '.com', note: 'Fixed .xom to .com' },
  { pattern: /\.dom$/i, replacement: '.com', note: 'Fixed .dom to .com' },
  { pattern: /\.con$/i, replacement: '.com', note: 'Fixed .con to .com' },
  { pattern: /\.cok$/i, replacement: '.com', note: 'Fixed .cok to .com' },
  { pattern: /\.col$/i, replacement: '.com', note: 'Fixed .col to .com' },
  { pattern: /\.comp$/i, replacement: '.com', note: 'Fixed .comp to .com' },
  { pattern: /\.comn$/i, replacement: '.com', note: 'Fixed .comn to .com' },
  { pattern: /\.comt$/i, replacement: '.com', note: 'Fixed .comt to .com' },
  { pattern: /\.cpm$/i, replacement: '.com', note: 'Fixed .cpm to .com' },
  { pattern: /\.cim$/i, replacement: '.com', note: 'Fixed .cim to .com' },
  { pattern: /\.cbm$/i, replacement: '.com', note: 'Fixed .cbm to .com' },
  { pattern: /\.ckm$/i, replacement: '.com', note: 'Fixed .ckm to .com' },
  { pattern: /\.cvom$/i, replacement: '.com', note: 'Fixed .cvom to .com' },
  { pattern: /\.cdom$/i, replacement: '.com', note: 'Fixed .cdom to .com' },
  { pattern: /\.cxom$/i, replacement: '.com', note: 'Fixed .cxom to .com' },
  { pattern: /\.ccom$/i, replacement: '.com', note: 'Fixed .ccom to .com' },
  { pattern: /\.nett$/i, replacement: '.net', note: 'Fixed .nett to .net' },
  { pattern: /\.ner$/i, replacement: '.net', note: 'Fixed .ner to .net' },
  { pattern: /\.ney$/i, replacement: '.net', note: 'Fixed .ney to .net' },
  { pattern: /\.met$/i, replacement: '.net', note: 'Fixed .met to .net' },
  { pattern: /\.nte$/i, replacement: '.net', note: 'Fixed .nte to .net' },
  { pattern: /\.orgg$/i, replacement: '.org', note: 'Fixed .orgg to .org' },
  { pattern: /\.orf$/i, replacement: '.org', note: 'Fixed .orf to .org' },
  { pattern: /\.rog$/i, replacement: '.org', note: 'Fixed .rog to .org' },
  { pattern: /\.prg$/i, replacement: '.org', note: 'Fixed .prg to .org' },
  { pattern: /\.infoo$/i, replacement: '.info', note: 'Fixed .infoo to .info' },
  { pattern: /\.bizz$/i, replacement: '.biz', note: 'Fixed .bizz to .biz' },
  { pattern: /\.gmai\./i, replacement: '.gmail.', note: 'Fixed .gmai. to .gmail.' },
  { pattern: /gmial\./i, replacement: 'gmail.', note: 'Fixed gmial. to gmail.' },
  { pattern: /gamil\./i, replacement: 'gmail.', note: 'Fixed gamil. to gmail.' },
  { pattern: /gmai\./i, replacement: 'gmail.', note: 'Fixed gmai. to gmail.' },
  { pattern: /ymail\./i, replacement: 'yahoo.', note: 'Fixed ymail. to yahoo.' },
  { pattern: /\.c$/i, replacement: '.com', note: 'Fixed .c to .com' },
  { pattern: /\.n$/i, replacement: '.net', note: 'Fixed .n to .net' },
  { pattern: /\.o$/i, replacement: '.org', note: 'Fixed .o to .org' },
  { pattern: /\.ne$/i, replacement: '.net', note: 'Fixed .ne to .net' },
  { pattern: /\.or$/i, replacement: '.org', note: 'Fixed .or to .org' },
];

/**
 * Common TLDs to compare against with Levenshtein
 */
const COMMON_TLDS = ['.com', '.net', '.org', '.info', '.biz', '.edu', '.gov'];

/**
 * Fix TLD for a given domain
 */
function fixTLD(domain) {
  const lower = domain.toLowerCase();
  let fixed = lower;
  let tldFixed = false;
  let originalTLD = '';
  let fixedTLD = '';
  let confidence = 'high';
  const notes = [];

  // First apply regex fixes on full domain
  for (const fix of REGEX_FIXES) {
    if (fix.pattern.test(fixed)) {
      fixed = fixed.replace(fix.pattern, fix.replacement);
      notes.push(fix.note);
      tldFixed = fixed !== lower;
    }
  }

  // Extract TLD info
  const { tld, baseDomain, isMultiPart } = extractTLD(fixed);
  originalTLD = tld;

  // If it's a multi-part known TLD, it's fine
  if (isMultiPart) {
    return {
      domain: fixed,
      tldFixed: fixed !== lower,
      originalTLD: tld,
      fixedTLD: tld,
      confidence: 'high',
      note: notes.join('; ') || 'Multi-part TLD, valid',
    };
  }

  // Check if TLD is valid in IANA list
  if (IANA_TLDS.has(tld) || VALID_UNUSUAL_TLDS.has(tld)) {
    // Special case: .co could be .com typo - flag it
    if (tld === '.co') {
      return {
        domain: fixed,
        tldFixed: fixed !== lower,
        originalTLD: tld,
        fixedTLD: tld,
        confidence: 'medium',
        note: 'Valid TLD (.co is Colombia) but verify - could be .com typo. DNS check will confirm.',
      };
    }
    return {
      domain: fixed,
      tldFixed: fixed !== lower,
      originalTLD: tld,
      fixedTLD: tld,
      confidence: 'high',
      note: notes.join('; ') || 'Valid IANA TLD',
    };
  }

  // Check fixes map
  if (TLD_FIXES[tld]) {
    const corrected = TLD_FIXES[tld];
    fixedTLD = corrected;
    fixed = baseDomain + corrected;
    tldFixed = true;
    notes.push(`TLD map fix: ${tld} → ${corrected}`);
    confidence = 'high';
  } else {
    // Levenshtein distance check against common TLDs
    let bestMatch = null;
    let bestDistance = Infinity;

    for (const commonTLD of COMMON_TLDS) {
      const dist = levenshtein(tld, commonTLD);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestMatch = commonTLD;
      }
    }

    if (bestDistance <= 1) {
      fixedTLD = bestMatch;
      fixed = baseDomain + bestMatch;
      tldFixed = true;
      notes.push(`Levenshtein fix (distance ${bestDistance}): ${tld} → ${bestMatch}`);
      confidence = 'high';
    } else if (bestDistance === 2 && bestMatch === '.com') {
      fixedTLD = '.com';
      fixed = baseDomain + '.com';
      tldFixed = true;
      notes.push(`Levenshtein fix (distance 2): ${tld} → .com`);
      confidence = 'medium';
    } else {
      // Unknown TLD - flag for review
      notes.push(`Unknown TLD: ${tld} (closest: ${bestMatch} at distance ${bestDistance})`);
      confidence = 'low';
      return {
        domain: fixed,
        tldFixed: false,
        originalTLD: tld,
        fixedTLD: tld,
        confidence: 'low',
        note: notes.join('; '),
        needsReview: true,
      };
    }
  }

  return {
    domain: fixed,
    tldFixed,
    originalTLD,
    fixedTLD: fixedTLD || originalTLD,
    confidence,
    note: notes.join('; '),
    needsReview: false,
  };
}

/**
 * Apply TLD fix to full email address
 */
function fixEmailTLD(email) {
  const atIdx = email.lastIndexOf('@');
  if (atIdx === -1) return { email, tldFixed: false, note: 'No @ found' };

  const localPart = email.slice(0, atIdx);
  const domain = email.slice(atIdx + 1);

  const result = fixTLD(domain);

  return {
    email: `${localPart}@${result.domain}`,
    domain: result.domain,
    tldFixed: result.tldFixed,
    originalTLD: result.originalTLD,
    fixedTLD: result.fixedTLD,
    confidence: result.confidence,
    note: result.note,
    needsReview: result.needsReview || false,
  };
}

module.exports = { fixEmailTLD, fixTLD, levenshtein, extractTLD };