'use strict';

const fs = require('fs');
const path = require('path');
const { parseFile } = require('./parser');
const { checkEmailsBatch, clearCache } = require('./dns-checker');
const { generateSeparatorExcel } = require('./excel-domain-separator');

// Consumer keywords - substring match on domain
const CONSUMER_KEYWORDS = [
  'gmail',
  'hotmail',
  'yahoo',
  'aol.',
  'msn.',
  'icloud',
];

function isConsumerDomain(domain) {
  if (!domain) return false;
  const lower = domain.toLowerCase();
  for (const kw of CONSUMER_KEYWORDS) {
    if (lower.includes(kw)) return true;
  }
  return false;
}

function updateStatus(jobDir, updates) {
  const statusPath = path.join(jobDir, 'status.json');
  try {
    let current = {};
    try {
      current = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    } catch (_) {
      current = {};
    }
    fs.writeFileSync(statusPath, JSON.stringify({ ...current, ...updates }, null, 2));
  } catch (e) {
    console.error('[SEPARATOR] Status update failed:', e.message);
  }
}

/**
 * Fast domain separator pipeline
 * Skips cleaning, TLD fixing, validation, categorization
 * Just: parse -> split by consumer/business -> optional DNS -> excel
 */
async function runSeparator(jobId, inputFilePath, jobDir, options = {}) {
  const startTime = Date.now();
  const checkGoogleMx = options.checkGoogleMx === true;

  console.log(`\n[SEPARATOR] ========================================`);
  console.log(`[SEPARATOR] Starting job: ${jobId}`);
  console.log(`[SEPARATOR] Check Google MX: ${checkGoogleMx}`);
  console.log(`[SEPARATOR] ========================================\n`);

  clearCache();

  try {
    // ==========================================
    // STAGE 1: PARSE
    // ==========================================
    updateStatus(jobDir, {
      status: 'parsing',
      currentStep: 'Reading your file...',
      progress: 0,
      total: 0,
    });

    const ext = path.extname(inputFilePath).toLowerCase();
    const fileBuffer = fs.readFileSync(inputFilePath);
    const rawEmails = parseFile(fileBuffer, ext);

    console.log(`[SEPARATOR] Parsed ${rawEmails.length} emails`);

    if (rawEmails.length === 0) {
      updateStatus(jobDir, {
        status: 'error',
        error: 'No email addresses found in the uploaded file.',
        currentStep: 'No emails found',
      });
      return;
    }

    const totalEmails = rawEmails.length;

    updateStatus(jobDir, {
      currentStep: `Found ${totalEmails} emails`,
      total: totalEmails,
      progress: 0,
    });

    // ==========================================
    // STAGE 2: SPLIT BY DOMAIN TYPE (super fast)
    // ==========================================
    updateStatus(jobDir, {
      status: 'sorting',
      currentStep: 'Separating consumer and business domains...',
      progress: 0,
      total: totalEmails,
    });

    const businessRecords = [];
    const consumerRecords = [];
    const seen = new Set(); // dedupe
    let sortProgress = 0;
    let lastUpdate = 0;

    for (const emailObj of rawEmails) {
      try {
        const raw = String(emailObj.raw || emailObj || '').trim().toLowerCase();
        if (!raw) { sortProgress++; continue; }

        // Dedupe
        if (seen.has(raw)) { sortProgress++; continue; }
        seen.add(raw);

        const atIdx = raw.lastIndexOf('@');
        if (atIdx === -1) { sortProgress++; continue; }

        const domain = raw.slice(atIdx + 1);
        if (!domain || !domain.includes('.')) { sortProgress++; continue; }

        const record = {
          email: raw,
          domain: domain,
          isGoogleWorkspace: 'Not Checked',
        };

        if (isConsumerDomain(domain)) {
          consumerRecords.push(record);
        } else {
          businessRecords.push(record);
        }
      } catch (err) {
        console.error('[SEPARATOR] Sort error:', err.message);
      }

      sortProgress++;
      if (sortProgress - lastUpdate >= 2000 || sortProgress === totalEmails) {
        lastUpdate = sortProgress;
        updateStatus(jobDir, {
          progress: sortProgress,
          total: totalEmails,
          currentStep: `Sorting ${sortProgress} of ${totalEmails}...`,
          stats: {
            business: businessRecords.length,
            consumer: consumerRecords.length,
            googleWorkspace: 0,
            checked: 0,
          },
        });
      }
    }

    console.log(`[SEPARATOR] Business: ${businessRecords.length}, Consumer: ${consumerRecords.length}`);

    updateStatus(jobDir, {
      progress: totalEmails,
      total: totalEmails,
      currentStep: `Separated ${businessRecords.length} business and ${consumerRecords.length} consumer emails.`,
      stats: {
        business: businessRecords.length,
        consumer: consumerRecords.length,
        googleWorkspace: 0,
        checked: 0,
      },
    });

    // ==========================================
    // STAGE 3: OPTIONAL DNS CHECK
    // ==========================================
    let googleCount = 0;

    if (checkGoogleMx) {
      // Only check business emails for Google Workspace MX
      // (Consumer emails are known — gmail is google, others aren't)
      const businessEmails = businessRecords.map(r => r.email);
      const consumerEmails = consumerRecords.map(r => r.email);
      const allToCheck = [...businessEmails, ...consumerEmails];

      const uniqueDomains = new Set(allToCheck.map(e => e.slice(e.lastIndexOf('@') + 1)));
      const dnsTotal = uniqueDomains.size;

      console.log(`[SEPARATOR] Checking Google MX on ${dnsTotal} unique domains`);

      updateStatus(jobDir, {
        status: 'mx',
        currentStep: `Checking Google Workspace MX for ${dnsTotal} domains...`,
        progress: 0,
        total: dnsTotal,
        stats: {
          business: businessRecords.length,
          consumer: consumerRecords.length,
          googleWorkspace: 0,
          checked: 0,
        },
      });

      // Build domain -> record map
      const domainToRecords = new Map();
      for (const r of businessRecords) {
        if (!domainToRecords.has(r.domain)) domainToRecords.set(r.domain, []);
        domainToRecords.get(r.domain).push(r);
      }
      for (const r of consumerRecords) {
        if (!domainToRecords.has(r.domain)) domainToRecords.set(r.domain, []);
        domainToRecords.get(r.domain).push(r);
      }

      let liveGoogle = 0;
      let checkedCount = 0;
      let updateCounter = 0;

      try {
        await checkEmailsBatch(
          allToCheck,
          (completed, total, currentDomain, domainResult) => {
            try {
              if (domainResult) {
                const isGoogle = domainResult.isGoogle;
                const records = domainToRecords.get(currentDomain) || [];
                for (const r of records) {
                  r.isGoogleWorkspace = isGoogle ? 'Yes' : 'No';
                  if (isGoogle) liveGoogle++;
                  checkedCount++;
                }
              }

              updateCounter++;
              if (updateCounter % 10 === 0 || completed === total) {
                updateStatus(jobDir, {
                  status: 'mx',
                  currentStep: `Checking ${completed} of ${total} domains: ${currentDomain}`,
                  progress: completed,
                  total,
                  stats: {
                    business: businessRecords.length,
                    consumer: consumerRecords.length,
                    googleWorkspace: liveGoogle,
                    checked: checkedCount,
                  },
                });
              }
            } catch (cbErr) {
              console.error('[SEPARATOR] Callback error:', cbErr.message);
            }
          }
        );
      } catch (dnsErr) {
        console.error('[SEPARATOR] DNS batch failed:', dnsErr.message);
      }

      googleCount = liveGoogle;
      console.log(`[SEPARATOR] Google Workspace domains found: ${googleCount}`);
    }

    // ==========================================
    // STAGE 4: EXCEL
    // ==========================================
    updateStatus(jobDir, {
      status: 'categorizing',
      currentStep: 'Generating Excel report...',
    });

    const outputPath = path.join(jobDir, 'result.xlsx');
    const fileName = path.basename(inputFilePath);
    const durationMs = Date.now() - startTime;

    generateSeparatorExcel({
      businessRecords,
      consumerRecords,
      checkedGoogleMx: checkGoogleMx,
      fileName,
      durationMs,
      outputPath,
    });

    console.log(`[SEPARATOR] Excel written to ${outputPath}`);

    // ==========================================
    // COMPLETE
    // ==========================================
    const finalDuration = Date.now() - startTime;

    updateStatus(jobDir, {
      status: 'complete',
      currentStep: 'Done! Your results are ready.',
      progress: totalEmails,
      total: totalEmails,
      stats: {
        business: businessRecords.length,
        consumer: consumerRecords.length,
        googleWorkspace: googleCount,
        checked: checkGoogleMx ? (businessRecords.length + consumerRecords.length) : 0,
        totalUnique: businessRecords.length + consumerRecords.length,
        totalRaw: totalEmails,
      },
      completedAt: new Date().toISOString(),
      durationMs: finalDuration,
    });

    console.log(`\n[SEPARATOR] ==========================================`);
    console.log(`[SEPARATOR] Job ${jobId} COMPLETE in ${Math.round(finalDuration / 1000)}s`);
    console.log(`[SEPARATOR] Business: ${businessRecords.length}`);
    console.log(`[SEPARATOR] Consumer: ${consumerRecords.length}`);
    console.log(`[SEPARATOR] Google MX: ${googleCount}`);
    console.log(`[SEPARATOR] ==========================================\n`);

  } catch (err) {
    console.error(`[SEPARATOR] Fatal error in job ${jobId}:`, err);
    updateStatus(jobDir, {
      status: 'error',
      error: err.message || 'Unknown separator error',
      currentStep: 'Separator encountered an error',
    });
  }
}

module.exports = { runSeparator };