'use strict';

const fs = require('fs');
const path = require('path');

// Load data files
const DATA_DIR = path.join(__dirname, '..', 'data');

function loadLines(filename) {
  try {
    const content = fs.readFileSync(path.join(DATA_DIR, filename), 'utf8');
    return content
      .split('\n')
      .map(l => l.trim().toLowerCase())
      .filter(l => l && !l.startsWith('#'));
  } catch (e) {
    console.warn(`[CLEANER] Could not load ${filename}:`, e.message);
    return [];
  }
}

// Load all filter/block lists
let FILTER_WORDS = [];
let BLOCKED_TLDS = [];
let BLOCKED_DOMAINS = [];
let DISPOSABLE_DOMAINS = [];

function loadData() {
  FILTER_WORDS = loadLines('filter-words.txt');
  BLOCKED_TLDS = loadLines('blocked-tlds.txt');
  BLOCKED_DOMAINS = loadLines('blocked-domain-endings.txt');
  DISPOSABLE_DOMAINS = loadLines('disposable-domains.txt');
  console.log(`[CLEANER] Loaded ${FILTER_WORDS.length} filter words`);
  console.log(`[CLEANER] Loaded ${BLOCKED_TLDS.length} blocked TLDs`);
  console.log(`[CLEANER] Loaded ${BLOCKED_DOMAINS.length} blocked domains`);
  console.log(`[CLEANER] Loaded ${DISPOSABLE_DOMAINS.length} disposable domains`);
}

loadData();

// Role-based local parts
const ROLE_BASED = new Set([
  'info', 'admin', 'support', 'sales', 'billing', 'help', 'contact',
  'hello', 'team', 'mail', 'office', 'careers', 'jobs', 'hr', 'legal',
  'privacy', 'security', 'webmaster', 'hostmaster', 'marketing',
  'newsletter', 'notifications', 'updates', 'news', 'abuse', 'postmaster',
  'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'mailer-daemon',
  'bounce', 'bounces', 'spam', 'spamtrap', 'automated', 'autoresponder',
  'auto-reply', 'autoreply', 'receipts', 'orders', 'order', 'invoice',
  'invoices', 'press', 'media', 'pr', 'finance', 'accounts', 'accounting',
  'payroll', 'it', 'tech', 'technology', 'dev', 'developer', 'software',
  'system', 'systems', 'alerts', 'auto', 'bot', 'robots', 'all', 'everyone',
  'community', 'shared', 'care', 'branding', 'advertising', 'enquiries',
  'inquiries', 'talent', 'compliance', 'risk', 'audit', 'governance',
  'ethics', 'fraud', 'whistleblower', 'academy', 'education', 'lms',
  'ehs', 'hse', 'osha', 'distribution', 'distlist', 'dl', 'emea',
  'apac', 'latam', 'worldwide', 'financial', 'humanresources', 'dispatch',
  'supply', 'transport', 'orders', 'operations', 'reception', 'general',
  'enquiry', 'query', 'feedback', 'service', 'services', 'customer',
  'clients', 'partners', 'vendor', 'vendors', 'purchasing', 'procurement',
  'tenders', 'bids', 'proposals', 'contracts', 'legal', 'compliance',
  'data', 'analytics', 'reporting', 'insights', 'research', 'growth',
  'partnerships', 'affiliate', 'referral', 'network', 'connect',
  'outreach', 'engage', 'communicate', 'welcome', 'onboarding',
  'offboarding', 'access', 'permissions', 'credentials', 'password',
  'reset', 'confirm', 'verify', 'verification', 'activate', 'activation',
]);

// Trade-based keywords (from your list)
const TRADE_KEYWORDS = [
  'electric', 'electrician', 'electrical', 'plumber', 'plumbing', 'plumb',
  'mechanical', 'mechanic', 'residential', 'resident', 'hvac', 'mason',
  'roofer', 'roofing', 'roof', 'welder', 'steelworker', 'ironworker',
  'concrete', 'drywall', 'painter', 'paint', 'glazier', 'insulator',
  'landscaper', 'excavator', 'equipment', 'tile', 'flooring', 'floor',
  'pipefitter', 'pipe', 'sheet', 'metal', 'demolition', 'cabinet',
  'wood', 'contractor', 'contract', 'construction', 'subcontractor',
  'build', 'framing', 'structural', 'steel', 'structure', 'gc', 'sub',
  'remodeling', 'commercial', 'masonry', 'coating', 'piping', 'plaster',
  'stone', 'renovation', 'aluminum', 'brick', 'decking', 'lumber',
  'moulding', 'mould', 'fiber', 'building', 'interior', 'paving',
  'exterior', 'civil', 'carpenter', 'carpentry', 'insulation', 'fence',
  'fencing', 'siding', 'stucco', 'waterproof', 'waterproofing',
  'fireproof', 'fireproofing', 'scaffold', 'scaffolding', 'crane',
  'earthwork', 'grading', 'sitework', 'utilities', 'underground',
  'foundation', 'basement', 'garage', 'parking', 'asphalt', 'paving',
  'hardscape', 'softscape', 'irrigation', 'sprinkler', 'fire',
  'suppression', 'sprinklers', 'alarm', 'security', 'cctv', 'access',
  'control', 'elevator', 'escalator', 'convey', 'conveyor',
];

// Junk characters at start/end of local part
const LEADING_JUNK = /^[._/=\-+*&^%$#!~`|\\<>{}\[\]()\s]+/;
const TRAILING_JUNK = /[._/=\-+*&^%$#!~`|\\<>{}\[\]()\s]+$/;

// Blocked domain patterns from your specific list
const SPECIFIC_BLOCKED_DOMAINS = new Set([
  'thermohvac.com', 'allspecialtysales.net', 'schroederiron.com',
  'divinedevelopmentconstruction.com', 'mamais.com', 'adcfloors.com',
  'jhcinc.net', 'rescottco.com', 'mundycos.com', 'millis.com',
  'themarketgroup.com', 'themarketgroups.com', 'alamosignsolutions.com',
  'ontoprenovation.com', 'transpect.com', 'netbest.com',
  'lemcoinc.com', 'omniretailenterprises.com', 'consigli.com',
  'acglp.com', 'reedoil.com', 'macd.org', 'horizonview.net',
  'fox.com', 'wjxt.com', 'alumla.com',
]);

// Blocked domain endings from your keyword list
const BLOCKED_DOMAIN_PATTERNS = [
  /\.(tv|pk|in|za|ar|ae|nz|jp|mil|hk|se|fi|tc|law|fm|uk|cn|nl|de|ie|fr|id|cz|lb|dk|lt|no|ws|es|th|edu|gov|ph|sa|la|aw|qa|pa|my|gh|bn|tw|ly|cy|sv|je|ke|pe|ve|md|lk|mk|cl|vn|tn|mn|ro|lv|me|ee|br|ir|kr|it|at|cr|gr|gt|pt|tr|mt|ru|eu|by|su|lu|ky|py|do|vi|ni|bo|ag|bg|kg|eg|mg|ch|bj|fj|dj|gl|sk|ml|pl|mx|az|kz|xyz|ec|mc|hn|sn|il|io)$/i,
  /\.(space|life|online|live|digital|global|city|town|earth|legal|mail|aero|tel|dev|vc|nyc)$/i,
  /\.(com\.bb|com\.ng|com\.ag|com\.er|gov\..+|edu\..+)$/i,
  /\.(webp|png|jpg|avif|heic|mic|gc)$/i,
];

// Blocked keywords in domain (from your list)
const BLOCKED_DOMAIN_KEYWORDS = [
  'qq', 'bellsouth', 'zoominternet', 'comcast', 'sbcglobal', 'taxcloud',
  'mailnator', 'homepage', 'viewbag', 'request', 'website', 'mystore',
  'yoursitename', 'micahrich', 'test957', 'mysite', 'yourbusiness',
  'ueni', 'fastsign', 'html',
];

// Filter keywords in email address (from your extended list)
const FILTER_EMAIL_KEYWORDS = [
  'donotreply', 'postmaster', 'toyota', 'navy', 'k12', '29t',
  'publish', 'autoreply', 'auto-reply', 'no-reply', 'noreply',
  'spam', 'domain', 'example', 'wispress', 'wixpress', 'sentry',
  'bluebook', 'houzz', 'buildzoom', 'yelp', 'procore', 'fruit',
  'accounting', 'account', 'motor', 'medicine', 'pharmacy',
  'dubai', 'qatar', 'army', 'lawoffice', 'lawgroup', 'lawyers',
  'lawfirm', 'advocate', 'mailer-daemon', 'bounce', 'abuse',
  'automated', 'newsletter', 'notifications', 'marketing',
  'receipts', 'invoice', 'invoices', 'no.reply', 'no_reply',
  'dispatch', 'orders', 'supply', 'transport', 'truck', 'print',
  'printing', 'suddenlink', 'centurylink', 'eastlink', 'westlink',
  'northlink', 'southlink', 'verizon', 'mazganny', 'moahelectric',
  'mandrmechanical', 'pcd-dover', 'nheld', 'mmallet', 'op@mcgc',
  'barry@kerr', 'bids@lang', 'ndobids@wml', 'jmarriott@ake',
  'tzuvela@', 'office@alumla', 'williams@onto', 'webmaster@net',
];

// Blocked TLD endings from your specific list
const BLOCKED_TLD_ENDINGS = new Set([
  '.tv', '.pk', '.in', '.za', '.ar', '.ae', '.nz', '.jp', '.mil',
  '.hk', '.se', '.fi', '.tc', '.law', '.fm', '.uk', '.cn', '.nl',
  '.de', '.ie', '.fr', '.id', '.cz', '.io', '.lb', '.dk', '.lt',
  '.no', '.ws', '.es', '.th', '.edu', '.gov', '.ph', '.sa', '.la',
  '.aw', '.qa', '.pa', '.my', '.gh', '.bn', '.tw', '.ly', '.cy',
  '.sv', '.je', '.ke', '.pe', '.ve', '.md', '.lk', '.mk', '.cl',
  '.vn', '.tn', '.mn', '.ro', '.lv', '.me', '.ee', '.br', '.ir',
  '.kr', '.it', '.at', '.cr', '.gr', '.gt', '.pt', '.tr', '.mt',
  '.ru', '.eu', '.by', '.su', '.lu', '.ky', '.py', '.do', '.vi',
  '.ni', '.bo', '.ag', '.bg', '.kg', '.eg', '.mg', '.ch', '.bj',
  '.fj', '.dj', '.gl', '.sk', '.ml', '.pl', '.mx', '.az', '.kz',
  '.xyz', '.ec', '.mc', '.hn', '.sn', '.il', '.io', '.space',
  '.life', '.online', '.live', '.digital', '.global', '.city',
  '.town', '.earth', '.legal', '.mail', '.aero', '.tel', '.dev',
  '.vc', '.nyc', '.rr', '.go', '.d',
]);

/**
 * URL decode percent-encoded characters in email
 */
function urlDecode(str) {
  return str
    .replace(/%20/g, '')
    .replace(/%40/g, '@')
    .replace(/%2e/gi, '.')
    .replace(/%2b/gi, '+')
    .replace(/%2c/gi, ',')
    .replace(/%3a/gi, ':')
    .replace(/%3b/gi, ';')
    .replace(/%3d/gi, '=')
    .replace(/%3f/gi, '?')
    .replace(/%23/gi, '#')
    .replace(/%26/gi, '&')
    .replace(/%25/gi, '%')
    .replace(/%[0-9a-fA-F]{2}/g, '');
}

/**
 * Check if domain matches any blocked TLD ending
 */
function isDomainTLDBlocked(domain) {
  const lower = domain.toLowerCase();

  // Check exact blocked TLD endings
  for (const tld of BLOCKED_TLD_ENDINGS) {
    if (lower.endsWith(tld)) return { blocked: true, reason: `Blocked TLD: ${tld}` };
  }

  // Check loaded blocked TLDs
  for (const tld of BLOCKED_TLDS) {
    if (lower.endsWith(tld)) return { blocked: true, reason: `Blocked TLD: ${tld}` };
  }

  // Check regex patterns
  for (const pattern of BLOCKED_DOMAIN_PATTERNS) {
    if (pattern.test(lower)) return { blocked: true, reason: `Blocked domain pattern: ${lower}` };
  }

  return { blocked: false };
}

/**
 * Check if local part or domain contains filter words
 */
function containsFilterWord(localPart, domain, fullEmail) {
  const lp = localPart.toLowerCase();
  const dm = domain.toLowerCase();
  const fe = fullEmail.toLowerCase();

  // Check filter keywords in the full email
  for (const kw of FILTER_EMAIL_KEYWORDS) {
    if (fe.includes(kw)) {
      return { found: true, word: kw, isRole: false };
    }
  }

  // Check loaded filter words
  for (const word of FILTER_WORDS) {
    if (lp === word || lp.includes(word)) {
      const isRole = ROLE_BASED.has(word) || ROLE_BASED.has(lp);
      return { found: true, word, isRole };
    }
  }

  // Check domain keywords
  for (const kw of BLOCKED_DOMAIN_KEYWORDS) {
    if (dm.includes(kw)) {
      return { found: true, word: kw, isRole: false };
    }
  }

  return { found: false };
}

/**
 * Check if email is role-based
 */
function checkRoleBased(localPart) {
  const lp = localPart.toLowerCase().replace(/[._-]/g, '');
  return ROLE_BASED.has(localPart.toLowerCase()) || ROLE_BASED.has(lp);
}

/**
 * Check if email is trade-based
 */
function checkTradeBased(localPart, domain) {
  const combined = (localPart + ' ' + domain).toLowerCase();
  for (const keyword of TRADE_KEYWORDS) {
    if (combined.includes(keyword)) {
      return { isTrade: true, keyword };
    }
  }
  return { isTrade: false };
}

/**
 * Check if domain is disposable
 */
function isDisposable(domain) {
  return DISPOSABLE_DOMAINS.includes(domain.toLowerCase()) ||
    BLOCKED_DOMAINS.includes(domain.toLowerCase());
}

/**
 * Check if domain is specifically blocked
 */
function isSpecificallyBlocked(domain) {
  return SPECIFIC_BLOCKED_DOMAINS.has(domain.toLowerCase());
}

/**
 * Clean the local part of an email
 */
function cleanLocalPart(local) {
  const modifications = [];
  let cleaned = local;

  // Remove leading junk characters
  const beforeLeading = cleaned;
  cleaned = cleaned.replace(LEADING_JUNK, '');
  if (cleaned !== beforeLeading) {
    modifications.push(`Removed leading junk characters: "${beforeLeading.slice(0, beforeLeading.length - cleaned.length)}"`);
  }

  // Remove trailing junk characters
  const beforeTrailing = cleaned;
  cleaned = cleaned.replace(TRAILING_JUNK, '');
  if (cleaned !== beforeTrailing) {
    modifications.push(`Removed trailing junk characters`);
  }

  // Check for %20 / "20" prefix artifact
  const before20 = cleaned;
  if (/^20[a-zA-Z]/.test(cleaned)) {
    const candidate = cleaned.slice(2);
    if (candidate.length >= 2) {
      cleaned = candidate;
      modifications.push(`Removed "20" prefix artifact (likely %20 URL encoding)`);
    }
  }

  // Remove trailing numbers (scraping artifacts)
  // But NOT if the entire local part is numeric, and NOT if it's a natural part of name
  const isAllNumeric = /^\d+$/.test(cleaned);
  if (!isAllNumeric) {
    const trailingNumMatch = cleaned.match(/^(.*[a-zA-Z])\d{2,}$/);
    if (trailingNumMatch) {
      const candidate = trailingNumMatch[1];
      if (candidate.length >= 2) {
        modifications.push(`Removed trailing numeric artifact: "${cleaned.slice(candidate.length)}"`);
        cleaned = candidate;
      }
    }
  }

  // Check for leading phone number pattern (7+ digits followed by letters)
  const phonePrefix = cleaned.match(/^(\d{7,})([a-zA-Z].*)$/);
  const hasLeadingPhone = !!phonePrefix;

  // Final cleanup of consecutive dots
  const beforeDots = cleaned;
  cleaned = cleaned.replace(/\.{2,}/g, '.');
  if (cleaned !== beforeDots) modifications.push('Removed consecutive dots in local part');

  // Remove leading/trailing dots
  cleaned = cleaned.replace(/^\.+/, '').replace(/\.+$/, '');

  return { cleaned, modifications, hasLeadingPhone, isAllNumeric };
}

/**
 * Clean the domain part of an email
 */
function cleanDomain(domain) {
  const modifications = [];
  let cleaned = domain.toLowerCase();

  // Remove trailing dots
  const beforeTrail = cleaned;
  cleaned = cleaned.replace(/\.+$/, '');
  if (cleaned !== beforeTrail) modifications.push('Removed trailing dot(s) from domain');

  // Replace multiple consecutive dots
  const beforeMulti = cleaned;
  cleaned = cleaned.replace(/\.{2,}/g, '.');
  if (cleaned !== beforeMulti) modifications.push('Removed consecutive dots in domain');

  // Remove invalid characters (keep only alphanumeric, dots, hyphens)
  const beforeInvalid = cleaned;
  cleaned = cleaned.replace(/[^a-z0-9.\-]/g, '');
  if (cleaned !== beforeInvalid) modifications.push('Removed invalid characters from domain');

  return { cleaned, modifications };
}

/**
 * Main cleaning function
 */
function cleanEmail(rawEmail) {
  const original = rawEmail;
  const allModifications = [];
  const flags = {
    isRoleBased: false,
    isTradeBased: false,
    tradeKeyword: null,
    hasLeadingPhone: false,
    hasSuspicious20: false,
    hasNumericOnly: false,
  };

  // Step 1: Lowercase and trim
  let email = rawEmail.trim().toLowerCase();
  if (email !== rawEmail) allModifications.push('Trimmed whitespace and lowercased');

  // Step 2: URL decode
  const beforeDecode = email;
  email = urlDecode(email);
  if (email !== beforeDecode) allModifications.push('URL decoded percent-encoded characters');

  // Step 3: Check if it has an @ symbol
  const atCount = (email.match(/@/g) || []).length;

  if (atCount === 0) {
    return {
      original,
      cleaned: email,
      localPart: '',
      domain: '',
      status: 'removed',
      modifications: allModifications,
      removalReason: 'No @ symbol found',
      flags,
    };
  }

  // Handle multiple @ symbols
  let localPart, domain;
  if (atCount > 1) {
    // Try to find the "real" @ by looking for domain-like structure
    const parts = email.split('@');
    // Take the last part that looks like a domain
    domain = parts[parts.length - 1];
    localPart = parts.slice(0, parts.length - 1).join('');
    allModifications.push(`Fixed multiple @ symbols (${atCount} found)`);
  } else {
    const atIdx = email.indexOf('@');
    localPart = email.slice(0, atIdx);
    domain = email.slice(atIdx + 1);
  }

  if (!localPart || !domain) {
    return {
      original,
      cleaned: email,
      localPart: localPart || '',
      domain: domain || '',
      status: 'removed',
      modifications: allModifications,
      removalReason: 'Empty local part or domain',
      flags,
    };
  }

  // Step 4 & 5: Clean local part
  const localResult = cleanLocalPart(localPart);
  if (localResult.cleaned !== localPart) {
    allModifications.push(...localResult.modifications);
    localPart = localResult.cleaned;
  }
  flags.hasLeadingPhone = localResult.hasLeadingPhone;
  flags.hasNumericOnly = localResult.isAllNumeric;

  // Check suspicious 20 prefix
  if (localResult.modifications.some(m => m.includes('20" prefix'))) {
    flags.hasSuspicious20 = true;
  }

  // Step 7: Clean domain
  const domainResult = cleanDomain(domain);
  if (domainResult.cleaned !== domain) {
    allModifications.push(...domainResult.modifications);
    domain = domainResult.cleaned;
  }

  // If local part is now empty, remove
  if (!localPart) {
    return {
      original,
      cleaned: `${localPart}@${domain}`,
      localPart,
      domain,
      status: 'removed',
      modifications: allModifications,
      removalReason: 'Local part became empty after cleaning',
      flags,
    };
  }

  // If domain is now empty, remove
  if (!domain || !domain.includes('.')) {
    return {
      original,
      cleaned: `${localPart}@${domain}`,
      localPart,
      domain,
      status: 'removed',
      modifications: allModifications,
      removalReason: 'Domain became invalid after cleaning',
      flags,
    };
  }

  const cleanedEmail = `${localPart}@${domain}`;

  // Step 3: Check filter words
  const filterCheck = containsFilterWord(localPart, domain, cleanedEmail);
  if (filterCheck.found) {
    if (filterCheck.isRole) {
      flags.isRoleBased = true;
      // Role-based: flag but don't remove
    } else {
      return {
        original,
        cleaned: cleanedEmail,
        localPart,
        domain,
        status: 'removed',
        modifications: allModifications,
        removalReason: `Filter word match: "${filterCheck.word}"`,
        flags,
      };
    }
  }

  // Check role-based
  if (!flags.isRoleBased && checkRoleBased(localPart)) {
    flags.isRoleBased = true;
  }

  // Check trade-based
  const tradeCheck = checkTradeBased(localPart, domain);
  if (tradeCheck.isTrade) {
    flags.isTradeBased = true;
    flags.tradeKeyword = tradeCheck.keyword;
  }

  // Step 8: Blocked TLD check
  const tldCheck = isDomainTLDBlocked(domain);
  if (tldCheck.blocked) {
    return {
      original,
      cleaned: cleanedEmail,
      localPart,
      domain,
      status: 'removed',
      modifications: allModifications,
      removalReason: tldCheck.reason,
      flags,
    };
  }

  // Blocked domain endings check
  if (isDisposable(domain)) {
    return {
      original,
      cleaned: cleanedEmail,
      localPart,
      domain,
      status: 'removed',
      modifications: allModifications,
      removalReason: `Disposable/blocked email provider: ${domain}`,
      flags,
    };
  }

  // Specific blocked domains
  if (isSpecificallyBlocked(domain)) {
    return {
      original,
      cleaned: cleanedEmail,
      localPart,
      domain,
      status: 'removed',
      modifications: allModifications,
      removalReason: `Specifically blocked domain: ${domain}`,
      flags,
    };
  }

  // Determine final status
  const wasModified = allModifications.length > 0;
  let status = wasModified ? 'modified' : 'clean';

  // Flag for review if suspicious patterns
  if (flags.hasLeadingPhone || flags.hasSuspicious20) {
    status = 'flagged';
  }

  return {
    original,
    cleaned: cleanedEmail,
    localPart,
    domain,
    status,
    modifications: allModifications,
    removalReason: null,
    flags,
  };
}

module.exports = { cleanEmail, loadData, isDisposable, checkRoleBased, TRADE_KEYWORDS };