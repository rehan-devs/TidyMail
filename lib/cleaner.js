'use strict';

const fs = require('fs');
const path = require('path');

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

// Role-based local parts (matched against local part ONLY)
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
  'supply', 'transport', 'operations', 'reception', 'general',
  'enquiry', 'query', 'feedback', 'service', 'services', 'customer',
  'clients', 'partners', 'vendor', 'vendors', 'purchasing', 'procurement',
  'tenders', 'bids', 'proposals', 'contracts',
  'data', 'analytics', 'reporting', 'insights', 'research', 'growth',
  'partnerships', 'affiliate', 'referral', 'network', 'connect',
  'outreach', 'engage', 'communicate', 'welcome', 'onboarding',
  'offboarding', 'access', 'permissions', 'credentials', 'password',
  'reset', 'confirm', 'verify', 'verification', 'activate', 'activation',
]);

// Trade-based keywords - checked against LOCAL PART ONLY (part before @)
const TRADE_KEYWORDS = [
  'electric', 'electrician', 'electrical', 'plumber', 'plumbing', 'plumb',
  'mechanical', 'mechanic', 'hvac', 'mason', 'masonry',
  'roofer', 'roofing', 'welder', 'ironworker',
  'concrete', 'drywall', 'painter', 'glazier', 'insulator',
  'landscaper', 'excavator', 'tile', 'flooring',
  'pipefitter', 'demolition', 'cabinet',
  'contractor', 'construction', 'subcontractor', 'framing',
  'remodeling', 'plaster', 'renovation', 'brick', 'decking',
  'lumber', 'moulding', 'paving', 'carpenter', 'carpentry',
  'insulation', 'fencing', 'siding', 'stucco', 'waterproofing',
  'fireproofing', 'scaffold', 'grading', 'foundation',
  'basement', 'asphalt', 'hardscape', 'softscape',
  'irrigation', 'sprinkler',
  // Also common local-part patterns that indicate trade personnel
  'electricguy', 'plumbguy', 'roofguy', 'concreteguy', 'buildguy',
  'buildpro', 'roofpro', 'plumbpro', 'electricpro',
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

const BLOCKED_DOMAIN_PATTERNS = [
  /\.(tv|pk|in|za|ar|ae|nz|jp|mil|hk|se|fi|tc|law|fm|uk|cn|nl|de|ie|fr|id|cz|lb|dk|lt|no|ws|es|th|edu|gov|ph|sa|la|aw|qa|pa|my|gh|bn|tw|ly|cy|sv|je|ke|pe|ve|md|lk|mk|cl|vn|tn|mn|ro|lv|me|ee|br|ir|kr|it|at|cr|gr|gt|pt|tr|mt|ru|eu|by|su|lu|ky|py|do|vi|ni|bo|ag|bg|kg|eg|mg|ch|bj|fj|dj|gl|sk|ml|pl|mx|az|kz|xyz|ec|mc|hn|sn|il|io)$/i,
  /\.(space|life|online|live|digital|global|city|town|earth|legal|mail|aero|tel|dev|vc|nyc)$/i,
  /\.(com\.bb|com\.ng|com\.ag|com\.er|gov\..+|edu\..+)$/i,
  /\.(webp|png|jpg|avif|heic|mic|gc)$/i,
];

const BLOCKED_DOMAIN_KEYWORDS = [
  'qq', 'bellsouth', 'zoominternet', 'comcast', 'sbcglobal', 'taxcloud',
  'mailnator', 'homepage', 'viewbag', 'request', 'website', 'mystore',
  'yoursitename', 'micahrich', 'test957', 'mysite', 'yourbusiness',
  'ueni', 'fastsign', 'html',
];

// Filter keywords that cause REMOVAL (checked in full email)
const FILTER_EMAIL_KEYWORDS = [
  'donotreply', 'postmaster', 'toyota', 'navy', 'k12', '29t',
  'publish', 'autoreply', 'auto-reply',
  'domain', 'example', 'wispress', 'wixpress', 'sentry',
  'bluebook', 'houzz', 'buildzoom', 'yelp', 'procore',
  'dubai', 'qatar', 'army', 'lawoffice', 'lawgroup',
  'lawfirm', 'advocate', 'mailer-daemon',
  'no.reply', 'no_reply',
  'suddenlink', 'centurylink', 'eastlink', 'westlink',
  'northlink', 'southlink', 'verizon', 'mazganny', 'moahelectric',
  'mandrmechanical', 'pcd-dover', 'nheld', 'mmallet', 'op@mcgc',
  'barry@kerr', 'bids@lang', 'ndobids@wml', 'jmarriott@ake',
  'tzuvela@', 'office@alumla', 'williams@onto', 'webmaster@net',
];

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
  '.xyz', '.ec', '.mc', '.hn', '.sn', '.il', '.space',
  '.life', '.online', '.live', '.digital', '.global', '.city',
  '.town', '.earth', '.legal', '.mail', '.aero', '.tel', '.dev',
  '.vc', '.nyc', '.rr', '.go', '.d',
]);

/**
 * URL decode percent-encoded characters
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

function isDomainTLDBlocked(domain) {
  const lower = domain.toLowerCase();

  for (const tld of BLOCKED_TLD_ENDINGS) {
    if (lower.endsWith(tld)) return { blocked: true, reason: `Blocked TLD: ${tld}` };
  }

  for (const tld of BLOCKED_TLDS) {
    if (lower.endsWith(tld)) return { blocked: true, reason: `Blocked TLD: ${tld}` };
  }

  for (const pattern of BLOCKED_DOMAIN_PATTERNS) {
    if (pattern.test(lower)) return { blocked: true, reason: `Blocked domain pattern: ${lower}` };
  }

  return { blocked: false };
}

function containsFilterWord(localPart, domain, fullEmail) {
  const lp = localPart.toLowerCase();
  const dm = domain.toLowerCase();
  const fe = fullEmail.toLowerCase();

  for (const kw of FILTER_EMAIL_KEYWORDS) {
    if (fe.includes(kw)) {
      return { found: true, word: kw };
    }
  }

  for (const word of FILTER_WORDS) {
    // Only consider filter word if it fully matches local part (not partial in email)
    if (lp === word) {
      return { found: true, word };
    }
  }

  for (const kw of BLOCKED_DOMAIN_KEYWORDS) {
    if (dm.includes(kw)) {
      return { found: true, word: kw };
    }
  }

  return { found: false };
}

/**
 * Check if local part is role-based.
 * Matches only against the local part (exact match or clear role prefix).
 */
function checkRoleBased(localPart) {
  const lp = localPart.toLowerCase();
  const lpNorm = lp.replace(/[._\-]/g, '');

  // Exact match
  if (ROLE_BASED.has(lp) || ROLE_BASED.has(lpNorm)) return true;

  // Check if local part starts with a role keyword followed by common separator
  // e.g. "info.us", "admin_team", "sales-2024"
  for (const role of ROLE_BASED) {
    if (lp.startsWith(role + '.') ||
        lp.startsWith(role + '_') ||
        lp.startsWith(role + '-') ||
        lp === role) {
      return true;
    }
  }

  return false;
}

/**
 * Check if email is trade-based.
 * IMPORTANT: Only checks the LOCAL PART (part before @), NOT the domain.
 * A person with a trade job would have keywords in their username/local part,
 * not just because their company domain has trade words.
 */
function checkTradeBased(localPart) {
  const lp = localPart.toLowerCase();

  for (const keyword of TRADE_KEYWORDS) {
    // Word boundary check — the keyword should be a distinct token in the local part
    // Match as full word: surrounded by boundaries or start/end
    const regex = new RegExp(`(^|[^a-z])${keyword}([^a-z]|$)`, 'i');
    if (regex.test(lp)) {
      return { isTrade: true, keyword };
    }
  }

  return { isTrade: false };
}

function isDisposable(domain) {
  return DISPOSABLE_DOMAINS.includes(domain.toLowerCase()) ||
    BLOCKED_DOMAINS.includes(domain.toLowerCase());
}

function isSpecificallyBlocked(domain) {
  return SPECIFIC_BLOCKED_DOMAINS.has(domain.toLowerCase());
}

function cleanLocalPart(local) {
  const modifications = [];
  let cleaned = local;

  const beforeLeading = cleaned;
  cleaned = cleaned.replace(LEADING_JUNK, '');
  if (cleaned !== beforeLeading) {
    modifications.push(`Removed leading junk: "${beforeLeading.slice(0, beforeLeading.length - cleaned.length)}"`);
  }

  const beforeTrailing = cleaned;
  cleaned = cleaned.replace(TRAILING_JUNK, '');
  if (cleaned !== beforeTrailing) {
    modifications.push(`Removed trailing junk`);
  }

  const before20 = cleaned;
  if (/^20[a-zA-Z]/.test(cleaned)) {
    const candidate = cleaned.slice(2);
    if (candidate.length >= 2) {
      cleaned = candidate;
      modifications.push(`Removed "20" prefix (URL encoding artifact)`);
    }
  }

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

  const phonePrefix = cleaned.match(/^(\d{7,})([a-zA-Z].*)$/);
  const hasLeadingPhone = !!phonePrefix;

  const beforeDots = cleaned;
  cleaned = cleaned.replace(/\.{2,}/g, '.');
  if (cleaned !== beforeDots) modifications.push('Removed consecutive dots in local part');

  cleaned = cleaned.replace(/^\.+/, '').replace(/\.+$/, '');

  return { cleaned, modifications, hasLeadingPhone, isAllNumeric };
}

function cleanDomain(domain) {
  const modifications = [];
  let cleaned = domain.toLowerCase();

  const beforeTrail = cleaned;
  cleaned = cleaned.replace(/\.+$/, '');
  if (cleaned !== beforeTrail) modifications.push('Removed trailing dot from domain');

  const beforeMulti = cleaned;
  cleaned = cleaned.replace(/\.{2,}/g, '.');
  if (cleaned !== beforeMulti) modifications.push('Removed consecutive dots in domain');

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

  let email = rawEmail.trim().toLowerCase();
  if (email !== rawEmail) allModifications.push('Trimmed whitespace and lowercased');

  const beforeDecode = email;
  email = urlDecode(email);
  if (email !== beforeDecode) allModifications.push('URL decoded percent-encoded characters');

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

  let localPart, domain;
  if (atCount > 1) {
    const parts = email.split('@');
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

  const localResult = cleanLocalPart(localPart);
  if (localResult.cleaned !== localPart) {
    allModifications.push(...localResult.modifications);
    localPart = localResult.cleaned;
  }
  flags.hasLeadingPhone = localResult.hasLeadingPhone;
  flags.hasNumericOnly = localResult.isAllNumeric;

  if (localResult.modifications.some(m => m.includes('20" prefix'))) {
    flags.hasSuspicious20 = true;
  }

  const domainResult = cleanDomain(domain);
  if (domainResult.cleaned !== domain) {
    allModifications.push(...domainResult.modifications);
    domain = domainResult.cleaned;
  }

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

  // Check filter words (removal)
  const filterCheck = containsFilterWord(localPart, domain, cleanedEmail);
  if (filterCheck.found) {
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

  // Check role-based (tag)
  if (checkRoleBased(localPart)) {
    flags.isRoleBased = true;
  }

  // Check trade-based (tag) - ONLY on local part
  const tradeCheck = checkTradeBased(localPart);
  if (tradeCheck.isTrade) {
    flags.isTradeBased = true;
    flags.tradeKeyword = tradeCheck.keyword;
  }

  // Blocked TLD check
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

  const wasModified = allModifications.length > 0;
  let status = wasModified ? 'modified' : 'clean';

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