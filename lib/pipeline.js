'use strict';

const fs = require('fs');
const path = require('path');

const { parseFile } = require('./parser');
const { cleanEmail } = require('./cleaner');
const { fixEmailTLD } = require('./tld-fixer');
const { validateEmail } = require('./validator');
const { checkEmailsBatch, clearCache } = require('./dns-checker');
const { categorizeAll } = require('./categorizer');
const { generateExcel } = require('./excel-generator');

/**
 * Update the status.json file for a job
 */
function updateStatus(jobDir, updates) {
  const statusPath = path.join(jobDir, 'status.json');
  try {
    const current = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    const updated = { ...current, ...updates };
    fs.writeFileSync(statusPath, JSON.stringify(updated, null, 2));
  } catch (e) {
    console.error('[PIPELINE] Failed to update status.json:', e.message);
  }
}

/**
 * Deduplicate emails - case-insensitive, keep cleanest version
 */
function deduplicateEmails(records) {
  const seen = new Map();

  for (const record of records) {
    const key = (record.cleaned || record.original).toLowerCase();

    if (!seen.has(key)) {
      seen.set(key, record);
    } else {
      const existing = seen.get(key);
      const existingMods = (existing.cleanModifications || []).length;
      const newMods = (record.cleanModifications || []).length;
      if (newMods < existingMods) {
        seen.set(key, record);
      }
    }
  }

  return [...seen.values()];
}

/**
 * Master pipeline orchestrator
 */
async function runPipeline(jobId, inputFilePath, jobDir) {
  const startTime = Date.now();
  console.log(`\n[PIPELINE] ========================================`);
  console.log(`[PIPELINE] Starting job: ${jobId}`);
  console.log(`[PIPELINE] Input file: ${inputFilePath}`);
  console.log(`[PIPELINE] ========================================\n`);

  clearCache();

  try {
    // ============================================================
    // STAGE 1: PARSING
    // ============================================================
    updateStatus(jobDir, {
      status: 'parsing',
      currentStep: 'Reading and parsing your file...',
      progress: 0,
      total: 0,
    });

    console.log('[PIPELINE] Stage 1: Parsing file...');

    const ext = path.extname(inputFilePath).toLowerCase();
    const fileBuffer = fs.readFileSync(inputFilePath);
    const rawEmails = parseFile(fileBuffer, ext);

    console.log(`[PIPELINE] Parsed ${rawEmails.length} email candidates`);

    updateStatus(jobDir, {
      currentStep: `Found ${rawEmails.length} email candidates in file`,
      total: rawEmails.length,
      progress: 0,
    });

    if (rawEmails.length === 0) {
      updateStatus(jobDir, {
        status: 'error',
        error: 'No email addresses found in the uploaded file. Please check the file contains email data.',
        currentStep: 'No emails found',
      });
      return;
    }

    // ============================================================
    // STAGE 2: CLEANING
    // ============================================================
    updateStatus(jobDir, {
      status: 'cleaning',
      currentStep: 'Cleaning and normalizing emails...',
      progress: 0,
      total: rawEmails.length,
    });

    console.log('[PIPELINE] Stage 2: Cleaning emails...');

    const cleanedRecords = [];
    const removedInCleaning = [];
    let cleanProgress = 0;
    let lastCleanUpdate = 0;

    for (const emailObj of rawEmails) {
      try {
        const raw = emailObj.raw || emailObj;
        const result = cleanEmail(raw);

        if (result.status === 'removed') {
          removedInCleaning.push({
            original: result.original,
            cleaned: result.cleaned,
            localPart: result.localPart,
            domain: result.domain,
            cleanStatus: 'removed',
            cleanModifications: result.modifications,
            removalReason: result.removalReason,
            flags: result.flags,
            tldFixed: false,
            tldNote: '',
            tldNeedsReview: false,
            validationResult: null,
            dnsResult: null,
          });
        } else {
          cleanedRecords.push({
            original: result.original,
            cleaned: result.cleaned,
            localPart: result.localPart,
            domain: result.domain,
            cleanStatus: result.status,
            cleanModifications: result.modifications,
            removalReason: null,
            flags: result.flags,
            tldFixed: false,
            tldNote: '',
            tldNeedsReview: false,
            originalTLD: '',
            fixedTLD: '',
            tldConfidence: '',
            validationResult: null,
            dnsResult: null,
          });
        }
      } catch (err) {
        console.error('[PIPELINE] Error cleaning email:', err.message);
        removedInCleaning.push({
          original: emailObj.raw || emailObj,
          cleaned: '',
          cleanStatus: 'removed',
          removalReason: `Cleaning error: ${err.message}`,
          flags: {},
          tldFixed: false,
          validationResult: null,
          dnsResult: null,
        });
      }

      cleanProgress++;
      // Batch UI updates (every 1000 or on last)
      if (cleanProgress - lastCleanUpdate >= 1000 || cleanProgress === rawEmails.length) {
        lastCleanUpdate = cleanProgress;
        updateStatus(jobDir, {
          progress: cleanProgress,
          currentStep: `Cleaning emails... ${cleanProgress} of ${rawEmails.length}`,
        });
      }
    }

    console.log(`[PIPELINE] Cleaning complete: ${cleanedRecords.length} survived, ${removedInCleaning.length} removed`);

    updateStatus(jobDir, {
      progress: rawEmails.length,
      currentStep: `Cleaning complete. ${cleanedRecords.length} emails survived initial cleaning.`,
      stats: {
        googleWorkspace: 0,
        nonGoogle: 0,
        catchAll: 0,
        removed: removedInCleaning.length,
        disposable: 0,
        fixed: 0,
        needsReview: 0,
        roleBased: 0,
        tradeBased: 0,
      },
    });

    // ============================================================
    // STAGE 3: TLD FIXING
    // ============================================================
    updateStatus(jobDir, {
      status: 'fixing',
      currentStep: 'Correcting TLD typos (.con to .com etc.)...',
      progress: 0,
      total: cleanedRecords.length,
    });

    console.log('[PIPELINE] Stage 3: Fixing TLDs...');

    let fixProgress = 0;
    let tldFixCount = 0;
    let lastFixUpdate = 0;

    for (const record of cleanedRecords) {
      try {
        const fixResult = fixEmailTLD(record.cleaned);
        if (fixResult.tldFixed) {
          record.cleaned = fixResult.email;
          record.domain = fixResult.domain;
          record.tldFixed = true;
          record.originalTLD = fixResult.originalTLD;
          record.fixedTLD = fixResult.fixedTLD;
          record.tldConfidence = fixResult.confidence;
          record.tldNote = fixResult.note;
          record.tldNeedsReview = fixResult.needsReview || false;
          if (!record.cleanModifications) record.cleanModifications = [];
          record.cleanModifications.push(`TLD fixed: ${fixResult.originalTLD} to ${fixResult.fixedTLD}`);
          tldFixCount++;
        } else {
          record.tldNote = fixResult.note || '';
          record.tldNeedsReview = fixResult.needsReview || false;
          record.tldConfidence = fixResult.confidence || 'high';
        }
      } catch (err) {
        console.error('[PIPELINE] TLD fix error:', err.message);
        record.tldNote = `TLD fix error: ${err.message}`;
      }

      fixProgress++;
      if (fixProgress - lastFixUpdate >= 1000 || fixProgress === cleanedRecords.length) {
        lastFixUpdate = fixProgress;
        updateStatus(jobDir, {
          progress: fixProgress,
          currentStep: `Fixing TLDs... ${fixProgress} of ${cleanedRecords.length} (${tldFixCount} fixed so far)`,
        });
      }
    }

    console.log(`[PIPELINE] TLD fixing complete: ${tldFixCount} TLDs corrected`);

    updateStatus(jobDir, {
      progress: cleanedRecords.length,
      currentStep: `TLD fixing complete. Corrected ${tldFixCount} email addresses.`,
    });

    // ============================================================
    // STAGE 4: VALIDATION
    // ============================================================
    updateStatus(jobDir, {
      status: 'validating',
      currentStep: 'Validating email format (RFC 5322)...',
      progress: 0,
      total: cleanedRecords.length,
    });

    console.log('[PIPELINE] Stage 4: Validating emails...');

    const validRecords = [];
    const invalidRecords = [];
    let validProgress = 0;
    let lastValidUpdate = 0;

    for (const record of cleanedRecords) {
      try {
        const validation = validateEmail(record.cleaned);
        record.validationResult = validation;

        if (!validation.isValid) {
          record.cleanStatus = 'removed';
          record.removalReason = `Invalid format: ${validation.issues.join('; ')}`;
          invalidRecords.push(record);
        } else {
          validRecords.push(record);
        }
      } catch (err) {
        console.error('[PIPELINE] Validation error:', err.message);
        record.validationResult = { isValid: false, issues: [`Validation error: ${err.message}`] };
        record.cleanStatus = 'removed';
        record.removalReason = `Validation error: ${err.message}`;
        invalidRecords.push(record);
      }

      validProgress++;
      if (validProgress - lastValidUpdate >= 1000 || validProgress === cleanedRecords.length) {
        lastValidUpdate = validProgress;
        updateStatus(jobDir, {
          progress: validProgress,
          currentStep: `Validating format... ${validProgress} of ${cleanedRecords.length}`,
        });
      }
    }

    console.log(`[PIPELINE] Validation complete: ${validRecords.length} valid, ${invalidRecords.length} invalid`);

    updateStatus(jobDir, {
      progress: cleanedRecords.length,
      currentStep: `Format validation complete. ${validRecords.length} emails pass format checks.`,
    });

    // ============================================================
    // STAGE 5: DEDUPLICATION
    // ============================================================
    updateStatus(jobDir, {
      status: 'validating',
      currentStep: 'Removing duplicate emails...',
    });

    console.log('[PIPELINE] Stage 5: Deduplicating...');

    const dedupedRecords = deduplicateEmails(validRecords);
    const dupCount = validRecords.length - dedupedRecords.length;

    console.log(`[PIPELINE] Deduplication complete: ${dupCount} duplicates removed, ${dedupedRecords.length} unique emails`);

    updateStatus(jobDir, {
      currentStep: `Removed ${dupCount} duplicates. ${dedupedRecords.length} unique emails to verify.`,
      total: dedupedRecords.length,
    });

    // ============================================================
    // STAGE 6: DNS + MX CHECKING (with live stats!)
    // ============================================================
    updateStatus(jobDir, {
      status: 'dns',
      currentStep: 'Checking domain existence (DNS lookup)...',
      progress: 0,
      total: dedupedRecords.length,
    });

    // Build domain -> email indices map for live stat tracking
    const domainToEmailIndices = new Map();
    for (let i = 0; i < dedupedRecords.length; i++) {
      const d = dedupedRecords[i].domain;
      if (!domainToEmailIndices.has(d)) domainToEmailIndices.set(d, []);
      domainToEmailIndices.get(d).push(i);
    }

    const uniqueDomains = new Set(dedupedRecords.map(r => r.domain));
    const dnsTotal = uniqueDomains.size;

    console.log(`[PIPELINE] Stage 6: DNS checking ${dedupedRecords.length} emails across ${dnsTotal} unique domains...`);

    updateStatus(jobDir, {
      status: 'mx',
      currentStep: `Checking ${dnsTotal} unique domains (DNS + MX records)...`,
      progress: 0,
      total: dnsTotal,
    });

    const emailStrings = dedupedRecords.map(r => r.cleaned);

    // Live stat counters
    let liveGoogle = 0;
    let liveNonGoogle = 0;
    let liveNoMx = 0;
    let liveNoDomain = 0;
    let updateCounter = 0;

    const dnsResults = await checkEmailsBatch(
      emailStrings,
      (completed, total, currentDomain, domainResult) => {
        // Live stats: count emails belonging to the just-resolved domain
        if (domainResult) {
          const indices = domainToEmailIndices.get(currentDomain) || [];
          const emailCount = indices.length;

          if (!domainResult.exists) {
            liveNoDomain += emailCount;
          } else if (!domainResult.hasMX) {
            liveNoMx += emailCount;
          } else if (domainResult.isGoogle) {
            liveGoogle += emailCount;
          } else {
            liveNonGoogle += emailCount;
          }
        }

        updateCounter++;

        // Update status.json every 5 domains OR on completion (avoid disk I/O spam)
        if (updateCounter % 5 === 0 || completed === total) {
          updateStatus(jobDir, {
            status: 'mx',
            currentStep: `Checking ${completed} of ${total}: ${currentDomain}`,
            progress: completed,
            total,
            stats: {
              googleWorkspace: liveGoogle,
              nonGoogle: liveNonGoogle,
              catchAll: 0,
              removed: (removedInCleaning.length + invalidRecords.length + liveNoDomain + liveNoMx),
              disposable: 0,
              fixed: tldFixCount,
              needsReview: 0,
              roleBased: 0,
              tradeBased: 0,
            },
          });
        }
      }
    );

    // Apply DNS results back to records
    for (let i = 0; i < dedupedRecords.length; i++) {
      const dnsResult = dnsResults[i];
      if (dnsResult && dnsResult.domainResult) {
        dedupedRecords[i].dnsResult = dnsResult.domainResult;
      } else {
        dedupedRecords[i].dnsResult = {
          exists: false,
          hasMX: false,
          isGoogle: false,
          provider: 'Unknown',
          catchAll: { likelyCatchAll: false, confidence: 'low', reason: 'DNS result missing' },
        };
      }
    }

    console.log(`[PIPELINE] DNS checking complete`);

    updateStatus(jobDir, {
      currentStep: `DNS verification complete for all ${dnsTotal} domains.`,
      progress: dnsTotal,
    });

    // ============================================================
    // STAGE 7: CATEGORIZATION
    // ============================================================
    updateStatus(jobDir, {
      status: 'categorizing',
      currentStep: 'Categorizing all emails...',
      progress: 0,
      total: dedupedRecords.length,
    });

    console.log('[PIPELINE] Stage 7: Categorizing...');

    const allRecordsForCategorization = [
      ...dedupedRecords,
      ...removedInCleaning,
      ...invalidRecords,
    ];

    const { results: categorizedResults, stats } = categorizeAll(allRecordsForCategorization);

    console.log('[PIPELINE] Categorization complete');
    console.log('[PIPELINE] Stats:', JSON.stringify(stats, null, 2));

    updateStatus(jobDir, {
      progress: allRecordsForCategorization.length,
      currentStep: `Categorization complete. Building Excel report...`,
      stats: {
        googleWorkspace: stats.googleWorkspace || 0,
        nonGoogle: stats.nonGoogle || 0,
        catchAll: stats.catchAll || 0,
        removed: stats.removed || 0,
        disposable: stats.disposable || 0,
        fixed: stats.fixed || 0,
        needsReview: stats.needsReview || 0,
        roleBased: stats.roleBased || 0,
        tradeBased: stats.tradeBased || 0,
      },
    });

    // ============================================================
    // STAGE 8: EXCEL GENERATION
    // ============================================================
    updateStatus(jobDir, {
      status: 'categorizing',
      currentStep: 'Generating Excel report with all sheets...',
    });

    console.log('[PIPELINE] Stage 8: Generating Excel...');

    const outputPath = path.join(jobDir, 'result.xlsx');
    const fileName = path.basename(inputFilePath);
    const durationMs = Date.now() - startTime;

    generateExcel(categorizedResults, stats, outputPath, fileName, durationMs);

    console.log(`[PIPELINE] Excel generated: ${outputPath}`);

    // ============================================================
    // COMPLETE
    // ============================================================
    const finalDuration = Date.now() - startTime;

    updateStatus(jobDir, {
      status: 'complete',
      currentStep: 'Done! Your results are ready to download.',
      progress: allRecordsForCategorization.length,
      total: allRecordsForCategorization.length,
      stats: {
        googleWorkspace: stats.googleWorkspace || 0,
        nonGoogle: stats.nonGoogle || 0,
        catchAll: stats.catchAll || 0,
        removed: stats.removed || 0,
        disposable: stats.disposable || 0,
        fixed: stats.fixed || 0,
        needsReview: stats.needsReview || 0,
        roleBased: stats.roleBased || 0,
        tradeBased: stats.tradeBased || 0,
      },
      completedAt: new Date().toISOString(),
      durationMs: finalDuration,
    });

    console.log(`\n[PIPELINE] ========================================`);
    console.log(`[PIPELINE] Job ${jobId} COMPLETE in ${Math.round(finalDuration / 1000)}s`);
    console.log(`[PIPELINE] Google Workspace: ${stats.googleWorkspace}`);
    console.log(`[PIPELINE] Non-Google: ${stats.nonGoogle}`);
    console.log(`[PIPELINE] Removed: ${stats.removed}`);
    console.log(`[PIPELINE] Needs Review: ${stats.needsReview}`);
    console.log(`[PIPELINE] ========================================\n`);

  } catch (err) {
    console.error(`[PIPELINE] Fatal error in job ${jobId}:`, err);
    updateStatus(jobDir, {
      status: 'error',
      error: err.message || 'Unknown pipeline error',
      currentStep: 'Pipeline encountered an error',
    });
  }
}

module.exports = { runPipeline };