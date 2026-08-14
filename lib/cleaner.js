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
  'electricguy', 'plumbguy', 'roofguy', 'concreteguy', 'buildguy',
  'buildpro', 'roofpro', 'plumbpro', 'electricpro',
];

// Junk characters at start/end of local part (does NOT include digits)
const LEADING_JUNK = /^[._/=\-+*&^%$#!~`|\\<>{}\[\]()\s]+/;
const TRAILING_JUNK = /[._/=\-+*&^%$#!~`|\\<>{}\[\]()\s]+$/;

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

function checkRoleBased(localPart) {
  const lp = localPart.toLowerCase();
  const lpNorm = lp.replace(/[._\-]/g, '');

  if (ROLE_BASED.has(lp) || ROLE_BASED.has(lpNorm)) return true;

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

function checkTradeBased(localPart) {
  const lp = localPart.toLowerCase();

  for (const keyword of TRADE_KEYWORDS) {
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

/**
 * Clean the local part.
 *
 * IMPORTANT: We do NOT remove numbers from the middle or end of a local part.
 * Numbers in email addresses are legitimate (birth years, disambiguation, etc.)
 * We only remove:
 *   - Non-alphanumeric junk chars at the start/end (dots, hyphens, symbols)
 *   - Leading "20" if it's clearly a %20 URL encoding artifact
 *   - Leading phone number is flagged but NOT removed
 */
function cleanLocalPart(local) {
  const modifications = [];
  let cleaned = local;

  // Remove leading junk (symbols only, not digits or letters)
  const beforeLeading = cleaned;
  cleaned = cleaned.replace(LEADING_JUNK, '');
  if (cleaned !== beforeLeading) {
    modifications.push(`Removed leading symbols: "${beforeLeading.slice(0, beforeLeading.length - cleaned.length)}"`);
  }

  // Remove trailing junk (symbols only, not digits or letters)
  const beforeTrailing = cleaned;
  cleaned = cleaned.replace(TRAILING_JUNK, '');
  if (cleaned !== beforeTrailing) {
    modifications.push(`Removed trailing symbols`);
  }

  // Remove leading "20" ONLY if the remaining part starts with a letter and
  // the ORIGINAL email likely came from URL encoding (unusual pattern).
  // This is a very cautious check now - only removes if pattern is REALLY suspicious.
  const before20 = cleaned;
  // Only remove "20" prefix if the WHOLE local part starts with "20" followed
  // by what looks like a common name pattern, AND the local part is unusually short
  if (/^20[a-z]{4,}$/i.test(cleaned) && cleaned.length <= 10) {
    // This looks like %20 artifact + a short word - could be a real leading "20" though
    // We'll leave this alone unless there's stronger signal, e.g. multiple %20 patterns
    // For safety, we do NOT strip it anymore
  }

  // Check for leading phone number pattern - FLAG only, do NOT remove
  const phonePrefix = cleaned.match(/^(\d{7,})([a-zA-Z].+)$/);
  const hasLeadingPhone = !!phonePrefix;

  const isAllNumeric = /^\d+$/.test(cleaned);

  // Collapse consecutive dots (dots are structural, safe to normalize)
  const beforeDots = cleaned;
  cleaned = cleaned.replace(/\.{2,}/g, '.');
  if (cleaned !== beforeDots) modifications.push('Collapsed consecutive dots in local part');

  // Remove leading/trailing dots
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

  // Guard against non-string
  if (typeof rawEmail !== 'string') {
    return {
      original: String(rawEmail),
      cleaned: '',
      localPart: '',
      domain: '',
      status: 'removed',
      modifications: [],
      removalReason: 'Input was not a string',
      flags,
    };
  }

  let email = rawEmail.trim().toLowerCase();
  if (email !== rawEmail.toLowerCase()) allModifications.push('Trimmed whitespace');

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

  if (checkRoleBased(localPart)) {
    flags.isRoleBased = true;
  }

  const tradeCheck = checkTradeBased(localPart);
  if (tradeCheck.isTrade) {
    flags.isTradeBased = true;
    flags.tradeKeyword = tradeCheck.keyword;
  }

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

  if (flags.hasLeadingPhone) {
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