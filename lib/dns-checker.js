'use strict';

const dns = require('dns');
const { promisify } = require('util');

// Use faster public DNS servers (Cloudflare + Google)
dns.setServers([
  '1.1.1.1',
  '1.0.0.1',
  '8.8.8.8',
  '8.8.4.4',
]);

// Promisify DNS functions
const resolve4 = promisify(dns.resolve4);
const resolve6 = promisify(dns.resolve6);
const resolveMx = promisify(dns.resolveMx);
const resolveTxt = promisify(dns.resolveTxt);

// Domain result cache - never look up the same domain twice
const domainCache = new Map();

// Known personal/consumer email providers - not catch-all
const CONSUMER_PROVIDERS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'yahoo.co.in',
  'yahoo.com.au', 'yahoo.ca', 'yahoo.fr', 'yahoo.de', 'yahoo.es',
  'hotmail.com', 'hotmail.co.uk', 'hotmail.fr', 'hotmail.de', 'hotmail.es',
  'hotmail.it', 'hotmail.com.au', 'hotmail.ca', 'outlook.com', 'outlook.co.uk',
  'live.com', 'live.co.uk', 'live.com.au', 'live.ca', 'live.fr',
  'msn.com', 'aol.com', 'aol.co.uk', 'icloud.com', 'me.com', 'mac.com',
  'protonmail.com', 'protonmail.ch', 'pm.me', 'tutanota.com', 'tutamail.com',
  'fastmail.com', 'fastmail.fm', 'zoho.com', 'yandex.com', 'yandex.ru',
  'mail.com', 'email.com', 'usa.com', 'hushmail.com', 'gmx.com', 'gmx.net',
  'gmx.de', 'web.de', 'cox.net', 'comcast.net', 'sbcglobal.net',
  'bellsouth.net', 'earthlink.net', 'charter.net', 'verizon.net',
  'att.net', 'optonline.net', 'roadrunner.com', 'windstream.net',
  'embarqmail.com', 'centurylink.net', 'frontier.com', 'juno.com',
  'netzero.net', 'netzero.com', 'rediffmail.com', 'indiatimes.com',
]);

// MX provider patterns
const MX_PROVIDERS = {
  google: [
    'aspmx.l.google.com', 'alt1.aspmx.l.google.com', 'alt2.aspmx.l.google.com',
    'alt3.aspmx.l.google.com', 'alt4.aspmx.l.google.com',
    'aspmx2.googlemail.com', 'aspmx3.googlemail.com',
    'aspmx4.googlemail.com', 'aspmx5.googlemail.com',
    'smtp.google.com', 'google.com', 'googlemail.com',
  ],
  microsoft: [
    'outlook.com', 'hotmail.com', 'microsoft.com',
    'protection.outlook.com', 'mail.protection.outlook.com',
    'olc.protection.outlook.com',
  ],
  yahoo: ['yahoodns.net', 'yahoo.com', 'yahoomail.com'],
  amazon: ['amazonses.com', 'amazon.com', 'amazonaws.com'],
  zoho: ['zoho.com', 'zohomail.com', 'mx.zoho.com'],
  protonmail: ['protonmail.ch', 'protonmail.com', 'pm.me'],
  mimecast: ['mimecast.com'],
  barracuda: ['barracudanetworks.com', 'ess.barracuda.com'],
  sendgrid: ['sendgrid.net', 'mx.sendgrid.net'],
  mailchimp: ['mailchimp.com', 'mcsv.net'],
  godaddy: ['secureserver.net', 'godaddy.com', 'smtp.secureserver.net'],
  namecheap: ['privateemail.com', 'namecheap.com'],
  bluehost: ['bluehost.com', 'mx1.bluehost.com', 'mx2.bluehost.com'],
  hostgator: ['hostgator.com', 'gator.hostgator.com'],
  siteground: ['siteground.com', 'siteground.net'],
  rackspace: ['emailsrvr.com', 'rackspace.com', 'mx1.emailsrvr.com'],
  fastmail: ['fastmail.com', 'fastmail.fm', 'messagingengine.com'],
  icloud: ['icloud.com', 'me.com', 'mac.com'],
  mailgun: ['mailgun.org', 'mxa.mailgun.org', 'mxb.mailgun.org'],
  sparkpost: ['sparkpostmail.com', 'sp.psmtp.com'],
  postmark: ['inbound.postmarkapp.com'],
  mailjet: ['mailjet.com', 'in.mailjet.com'],
  sendinblue: ['sendinblue.com', 'smtp-relay.sendinblue.com'],
  trendmicro: ['trendmicro.com', 'in.trendmicro.com'],
  sophos: ['sophos.com', 'hydra.sophos.com'],
  proofpoint: ['pphosted.com', 'proofpoint.com'],
  forcepoint: ['forcepoint.com', 'mxedge.forcepoint.net'],
  cisco: ['cisco.com', 'iphmx.com'],
  spamhero: ['spamhero.com'],
  mailprotector: ['mailprotector.com', 'mailprotector.net'],
  greatwall: ['greatwall.io'],
  messagelabs: ['messagelabs.com', 'symantec.com'],
};

// Shared hosting MX patterns (likely catch-all)
const SHARED_HOSTING_MX_PATTERNS = [
  'secureserver.net', 'hostgator.com', 'bluehost.com', 'siteground.com',
  'inmotionhosting.com', 'dreamhost.com', 'pair.com', 'register.com',
  'networksolutions.com', 'hostmonster.com', 'fatcow.com', 'ipage.com',
  'justhost.com', 'greengeeks.com', 'a2hosting.com', 'liquidweb.com',
  'hostpapa.com', 'interserver.net', 'websitehostingserver.com',
  'webhostinghub.com', 'hostnine.com', 'arvixe.com',
  'nearlyfreespeech.net', 'vps.net', 'linode.com',
];

/**
 * Safe DNS lookup with timeout
 */
async function safeLookup(fn, arg, type, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({ result: null, error: 'TIMEOUT' });
    }, timeoutMs);

    fn(arg, (err, result) => {
      clearTimeout(timer);
      if (err) {
        resolve({ result: null, error: err.code || err.message });
      } else {
        resolve({ result, error: null });
      }
    });
  });
}

/**
 * Check if a domain exists (has A, AAAA, or MX records)
 */
async function checkDomainExists(domain) {
  const lower = domain.toLowerCase();

  const [a, aaaa, mx] = await Promise.all([
    safeLookup(dns.resolve4, lower, 'A'),
    safeLookup(dns.resolve6, lower, 'AAAA'),
    safeLookup(dns.resolveMx, lower, 'MX'),
  ]);

  const hasA = a.result && a.result.length > 0;
  const hasAAAA = aaaa.result && aaaa.result.length > 0;
  const hasMX = mx.result && mx.result.length > 0;
  const exists = hasA || hasAAAA || hasMX;

  return {
    exists,
    hasA,
    hasAAAA,
    hasMX,
    mxRecords: mx.result || [],
    errors: {
      a: a.error,
      aaaa: aaaa.error,
      mx: mx.error,
    },
  };
}

/**
 * Check MX records for a domain
 */
async function checkMXRecords(domain) {
  const lower = domain.toLowerCase();
  const { result, error } = await safeLookup(dns.resolveMx, lower, 'MX');

  if (error || !result) {
    return { hasMX: false, records: [], error };
  }

  const sorted = result.sort((a, b) => a.priority - b.priority);

  return {
    hasMX: sorted.length > 0,
    records: sorted,
    error: null,
  };
}

/**
 * Check if MX records indicate Google Workspace
 */
function isGoogleWorkspace(mxRecords) {
  if (!mxRecords || mxRecords.length === 0) return false;

  for (const record of mxRecords) {
    const exchange = (record.exchange || '').toLowerCase();
    for (const pattern of MX_PROVIDERS.google) {
      if (exchange.includes(pattern) || exchange.endsWith(pattern)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Get the email provider name from MX records
 */
function getMXProvider(mxRecords) {
  if (!mxRecords || mxRecords.length === 0) return 'No MX Records';

  for (const record of mxRecords) {
    const exchange = (record.exchange || '').toLowerCase();

    for (const [providerName, patterns] of Object.entries(MX_PROVIDERS)) {
      for (const pattern of patterns) {
        if (exchange.includes(pattern)) {
          const names = {
            google: 'Google Workspace',
            microsoft: 'Microsoft 365',
            yahoo: 'Yahoo Mail',
            amazon: 'Amazon SES',
            zoho: 'Zoho Mail',
            protonmail: 'ProtonMail',
            mimecast: 'Mimecast',
            barracuda: 'Barracuda',
            sendgrid: 'SendGrid',
            mailchimp: 'Mailchimp',
            godaddy: 'GoDaddy',
            namecheap: 'Namecheap',
            bluehost: 'Bluehost',
            hostgator: 'HostGator',
            siteground: 'SiteGround',
            rackspace: 'Rackspace',
            fastmail: 'Fastmail',
            icloud: 'Apple iCloud',
            mailgun: 'Mailgun',
            sparkpost: 'SparkPost',
            postmark: 'Postmark',
            mailjet: 'Mailjet',
            sendinblue: 'Sendinblue',
            trendmicro: 'Trend Micro',
            sophos: 'Sophos',
            proofpoint: 'Proofpoint',
            forcepoint: 'Forcepoint',
            cisco: 'Cisco IronPort',
            spamhero: 'SpamHero',
            mailprotector: 'Mail Protector',
            messagelabs: 'Symantec MessageLabs',
          };
          return names[providerName] || providerName;
        }
      }
    }
  }

  return mxRecords[0]
    ? `Unknown (${mxRecords[0].exchange})`
    : 'Unknown Provider';
}

/**
 * Detect if domain is likely catch-all using DNS heuristics
 */
async function detectCatchAll(domain, mxRecords) {
  const lower = domain.toLowerCase();

  if (CONSUMER_PROVIDERS.has(lower)) {
    return {
      likelyCatchAll: false,
      confidence: 'high',
      reason: 'Consumer email provider - individual mailboxes',
      heuristicOnly: true,
    };
  }

  const [spfResult, dkimResult] = await Promise.all([
    safeLookup(dns.resolveTxt, lower, 'TXT'),
    safeLookup(dns.resolveTxt, `_domainkey.${lower}`, 'TXT'),
  ]);

  let hasValidSPF = false;
  let hasDKIM = false;

  if (spfResult.result) {
    const txtRecords = spfResult.result.flat().join(' ').toLowerCase();
    hasValidSPF = txtRecords.includes('v=spf1') &&
      (txtRecords.includes('~all') || txtRecords.includes('-all'));
  }

  if (dkimResult.result && dkimResult.result.length > 0) {
    hasDKIM = true;
  }

  let isSharedHosting = false;
  for (const record of (mxRecords || [])) {
    const exchange = (record.exchange || '').toLowerCase();
    for (const pattern of SHARED_HOSTING_MX_PATTERNS) {
      if (exchange.includes(pattern)) {
        isSharedHosting = true;
        break;
      }
    }
    if (isSharedHosting) break;
  }

  if (isSharedHosting && !hasValidSPF) {
    return {
      likelyCatchAll: true,
      confidence: 'medium',
      reason: 'Shared hosting MX + no strict SPF policy',
      heuristicOnly: true,
    };
  }

  if (hasValidSPF && hasDKIM) {
    return {
      likelyCatchAll: false,
      confidence: 'medium',
      reason: 'Has strict SPF and DKIM - likely properly managed mailbox',
      heuristicOnly: true,
    };
  }

  if (isSharedHosting) {
    return {
      likelyCatchAll: true,
      confidence: 'low',
      reason: 'Shared hosting MX detected - possible catch-all',
      heuristicOnly: true,
    };
  }

  return {
    likelyCatchAll: false,
    confidence: 'low',
    reason: 'Insufficient data for catch-all determination',
    heuristicOnly: true,
  };
}

/**
 * Full domain check - combines all checks
 */
async function checkDomain(domain) {
  const lower = domain.toLowerCase().trim();

  if (domainCache.has(lower)) {
    return domainCache.get(lower);
  }

  try {
    const existenceCheck = await checkDomainExists(lower);

    let mxRecords = existenceCheck.mxRecords;

    if (!existenceCheck.hasMX && existenceCheck.exists) {
      const mxCheck = await checkMXRecords(lower);
      mxRecords = mxCheck.records;
      existenceCheck.hasMX = mxCheck.hasMX;
    }

    const isGoogle = isGoogleWorkspace(mxRecords);
    const provider = getMXProvider(mxRecords);

    let catchAllResult = {
      likelyCatchAll: false,
      confidence: 'low',
      reason: 'Domain not checked',
      heuristicOnly: true,
    };

    if (existenceCheck.exists && existenceCheck.hasMX) {
      catchAllResult = await detectCatchAll(lower, mxRecords);
    }

    const result = {
      domain: lower,
      exists: existenceCheck.exists,
      hasA: existenceCheck.hasA,
      hasAAAA: existenceCheck.hasAAAA,
      hasMX: existenceCheck.hasMX,
      mxRecords,
      isGoogle,
      provider,
      catchAll: catchAllResult,
      checkedAt: new Date().toISOString(),
    };

    domainCache.set(lower, result);
    return result;

  } catch (err) {
    console.error(`[DNS] Error checking domain ${lower}:`, err.message);

    const errorResult = {
      domain: lower,
      exists: false,
      hasA: false,
      hasAAAA: false,
      hasMX: false,
      mxRecords: [],
      isGoogle: false,
      provider: 'Unknown',
      catchAll: {
        likelyCatchAll: false,
        confidence: 'low',
        reason: `DNS check error: ${err.message}`,
        heuristicOnly: true,
      },
      error: err.message,
      checkedAt: new Date().toISOString(),
    };

    domainCache.set(lower, errorResult);
    return errorResult;
  }
}

/**
 * Process emails in batches with controlled concurrency
 * Uses domain caching so each unique domain is only looked up once
 * Callback signature: onProgress(completed, total, currentDomain, domainResult)
 */
async function checkEmailsBatch(emails, onProgress) {
  const CONCURRENCY = 70;

  // Extract unique domains
  const domainToEmails = new Map();
  for (let i = 0; i < emails.length; i++) {
    const email = emails[i];
    const atIdx = email.indexOf('@');
    if (atIdx === -1) continue;
    const domain = email.slice(atIdx + 1).toLowerCase();
    if (!domainToEmails.has(domain)) {
      domainToEmails.set(domain, []);
    }
    domainToEmails.get(domain).push(i);
  }

  const uniqueDomains = [...domainToEmails.keys()];
  console.log(`[DNS] Processing ${emails.length} emails across ${uniqueDomains.length} unique domains (concurrency: ${CONCURRENCY})`);

  // Results array - pre-allocated
  const results = new Array(emails.length).fill(null);

  // Process domains with controlled concurrency
  let completedDomains = 0;
  let domainIdx = 0;

  async function processNext() {
    while (domainIdx < uniqueDomains.length) {
      const currentDomainIdx = domainIdx++;
      const domain = uniqueDomains[currentDomainIdx];

      try {
        const domainResult = await checkDomain(domain);

        // Apply result to all emails with this domain
        const emailIndices = domainToEmails.get(domain) || [];
        for (const idx of emailIndices) {
          results[idx] = {
            email: emails[idx],
            domain,
            domainResult,
          };
        }

        completedDomains++;

        if (typeof onProgress === 'function') {
          onProgress(completedDomains, uniqueDomains.length, domain, domainResult);
        }

      } catch (err) {
        console.error(`[DNS] Failed to check domain ${domain}:`, err.message);

        const errorDomainResult = {
          domain,
          exists: false,
          hasA: false,
          hasAAAA: false,
          hasMX: false,
          mxRecords: [],
          isGoogle: false,
          provider: 'Unknown',
          catchAll: {
            likelyCatchAll: false,
            confidence: 'low',
            reason: `Error: ${err.message}`,
            heuristicOnly: true,
          },
          error: err.message,
        };

        const emailIndices = domainToEmails.get(domain) || [];
        for (const idx of emailIndices) {
          results[idx] = {
            email: emails[idx],
            domain,
            domainResult: errorDomainResult,
          };
        }

        completedDomains++;
        if (typeof onProgress === 'function') {
          onProgress(completedDomains, uniqueDomains.length, domain, errorDomainResult);
        }
      }
    }
  }

  // Spin up concurrency pool
  const workers = [];
  for (let i = 0; i < Math.min(CONCURRENCY, uniqueDomains.length); i++) {
    workers.push(processNext());
  }

  await Promise.all(workers);

  // Verify all results are filled (safety check)
  for (let i = 0; i < results.length; i++) {
    if (results[i] === null) {
      console.warn(`[DNS] Missing result at index ${i}, filling with error`);
      const email = emails[i];
      const atIdx = email.indexOf('@');
      const domain = atIdx !== -1 ? email.slice(atIdx + 1) : 'unknown';
      results[i] = {
        email,
        domain,
        domainResult: {
          domain,
          exists: false,
          hasMX: false,
          isGoogle: false,
          provider: 'Unknown',
          catchAll: { likelyCatchAll: false, confidence: 'low', reason: 'Missing result', heuristicOnly: true },
          error: 'Result missing after batch processing',
        },
      };
    }
  }

  console.log(`[DNS] Completed checking ${uniqueDomains.length} unique domains for ${emails.length} emails`);
  return results;
}

/**
 * Clear the domain cache (useful between jobs)
 */
function clearCache() {
  domainCache.clear();
}

module.exports = {
  checkDomain,
  checkDomainExists,
  checkMXRecords,
  isGoogleWorkspace,
  getMXProvider,
  detectCatchAll,
  checkEmailsBatch,
  clearCache,
};