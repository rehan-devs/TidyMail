'use strict';

/**
 * Categorization engine v2.
 * Primary categories are DNS-based (Google / Non-Google / Removed).
 * Trade-based, Role-based, Catch-all are TAGS that can co-exist with primary category.
 */

const CATEGORIES = {
  GOOGLE_WORKSPACE: 'google-workspace',
  NON_GOOGLE: 'non-google',
  REMOVED_FILTER_WORD: 'removed-filter-word',
  REMOVED_BLOCKED_TLD: 'removed-blocked-tld',
  REMOVED_INVALID_FORMAT: 'removed-invalid-format',
  REMOVED_DOMAIN_NOT_FOUND: 'removed-domain-not-found',
  REMOVED_NO_MX: 'removed-no-mx',
  DISPOSABLE: 'disposable',
  NEEDS_REVIEW: 'needs-review',
};

const CATEGORY_LABELS = {
  [CATEGORIES.GOOGLE_WORKSPACE]: 'Google Workspace',
  [CATEGORIES.NON_GOOGLE]: 'Non-Google',
  [CATEGORIES.REMOVED_FILTER_WORD]: 'Removed: Filter Word',
  [CATEGORIES.REMOVED_BLOCKED_TLD]: 'Removed: Blocked TLD',
  [CATEGORIES.REMOVED_INVALID_FORMAT]: 'Removed: Invalid Format',
  [CATEGORIES.REMOVED_DOMAIN_NOT_FOUND]: 'Removed: Domain Not Found',
  [CATEGORIES.REMOVED_NO_MX]: 'Removed: No MX Records',
  [CATEGORIES.DISPOSABLE]: 'Disposable',
  [CATEGORIES.NEEDS_REVIEW]: 'Needs Review',
};

/**
 * Categorize a single processed email record.
 * Returns: { category, label, reason, notes, tags: { isRoleBased, isTradeBased, isCatchAll, isFixed } }
 */
function categorizeEmail(record) {
  const {
    original,
    cleaned,
    localPart,
    domain,
    cleanStatus,
    removalReason,
    flags,
    tldFixed,
    tldNote,
    tldNeedsReview,
    validationResult,
    dnsResult,
  } = record;

  const notes = [];
  if (tldNote) notes.push(tldNote);

  // Build tags (these can co-exist with any primary category)
  const tags = {
    isRoleBased: !!(flags && flags.isRoleBased),
    isTradeBased: !!(flags && flags.isTradeBased),
    tradeKeyword: (flags && flags.tradeKeyword) || null,
    isCatchAll: !!(dnsResult && dnsResult.catchAll && dnsResult.catchAll.likelyCatchAll),
    catchAllConfidence: (dnsResult && dnsResult.catchAll && dnsResult.catchAll.confidence) || null,
    isFixed: !!tldFixed || (record.cleanModifications && record.cleanModifications.length > 0),
    hasLeadingPhone: !!(flags && flags.hasLeadingPhone),
    hasSuspicious20: !!(flags && flags.hasSuspicious20),
    hasNumericOnly: !!(flags && flags.hasNumericOnly),
  };

  // Add tags to notes for visibility
  if (tags.isTradeBased) notes.push(`Trade keyword: ${tags.tradeKeyword}`);
  if (tags.isRoleBased) notes.push('Role-based address');
  if (tags.isCatchAll) notes.push(`Catch-all signal (${tags.catchAllConfidence} confidence)`);
  if (tags.isFixed && tldFixed) notes.push('TLD was corrected');

  // ============================================================
  // PRIORITY 1: Removed by cleaner
  // ============================================================
  if (cleanStatus === 'removed') {
    const reason = removalReason || 'Unknown reason';

    if (reason.includes('Blocked TLD') || reason.includes('Blocked domain pattern')) {
      return {
        category: CATEGORIES.REMOVED_BLOCKED_TLD,
        label: CATEGORY_LABELS[CATEGORIES.REMOVED_BLOCKED_TLD],
        reason,
        notes: notes.join(' | '),
        tags,
      };
    }

    if (reason.includes('Disposable') || reason.includes('blocked domain') ||
        reason.includes('Specifically blocked')) {
      return {
        category: CATEGORIES.DISPOSABLE,
        label: CATEGORY_LABELS[CATEGORIES.DISPOSABLE],
        reason,
        notes: notes.join(' | '),
        tags,
      };
    }

    return {
      category: CATEGORIES.REMOVED_FILTER_WORD,
      label: CATEGORY_LABELS[CATEGORIES.REMOVED_FILTER_WORD],
      reason,
      notes: notes.join(' | '),
      tags,
    };
  }

  // ============================================================
  // PRIORITY 2: Invalid format
  // ============================================================
  if (!validationResult || !validationResult.isValid) {
    const issues = validationResult ? validationResult.issues.join('; ') : 'Validation not run';
    return {
      category: CATEGORIES.REMOVED_INVALID_FORMAT,
      label: CATEGORY_LABELS[CATEGORIES.REMOVED_INVALID_FORMAT],
      reason: `Invalid format: ${issues}`,
      notes: notes.join(' | '),
      tags,
    };
  }

  // ============================================================
  // PRIORITY 3: Unknown TLD (needs review only if not fixed)
  // ============================================================
  if (tldNeedsReview && !tldFixed) {
    notes.push('Unknown TLD - requires manual verification');
    return {
      category: CATEGORIES.NEEDS_REVIEW,
      label: CATEGORY_LABELS[CATEGORIES.NEEDS_REVIEW],
      reason: `Unknown TLD: ${tldNote}`,
      notes: notes.join(' | '),
      tags,
    };
  }

  // ============================================================
  // PRIORITY 4: DNS checks
  // ============================================================
  if (dnsResult) {
    if (!dnsResult.exists) {
      return {
        category: CATEGORIES.REMOVED_DOMAIN_NOT_FOUND,
        label: CATEGORY_LABELS[CATEGORIES.REMOVED_DOMAIN_NOT_FOUND],
        reason: `Domain "${domain}" does not exist in DNS`,
        notes: notes.join(' | '),
        tags,
      };
    }

    if (!dnsResult.hasMX) {
      return {
        category: CATEGORIES.REMOVED_NO_MX,
        label: CATEGORY_LABELS[CATEGORIES.REMOVED_NO_MX],
        reason: `Domain "${domain}" has no MX records - cannot receive email`,
        notes: notes.join(' | '),
        tags,
      };
    }

    // Add provider info
    if (dnsResult.provider) notes.push(`Provider: ${dnsResult.provider}`);

    // ============================================================
    // PRIMARY: Google or Non-Google (tags are separate!)
    // ============================================================
    if (dnsResult.isGoogle) {
      return {
        category: CATEGORIES.GOOGLE_WORKSPACE,
        label: CATEGORY_LABELS[CATEGORIES.GOOGLE_WORKSPACE],
        reason: 'Google Workspace domain, valid format, MX records present',
        notes: notes.join(' | '),
        tags,
      };
    }

    return {
      category: CATEGORIES.NON_GOOGLE,
      label: CATEGORY_LABELS[CATEGORIES.NON_GOOGLE],
      reason: `Valid email on ${dnsResult.provider || 'unknown provider'}`,
      notes: notes.join(' | '),
      tags,
    };
  }

  // Fallback: DNS result missing
  notes.push('DNS check result unavailable');
  return {
    category: CATEGORIES.NEEDS_REVIEW,
    label: CATEGORY_LABELS[CATEGORIES.NEEDS_REVIEW],
    reason: 'Could not complete all verification checks',
    notes: notes.join(' | '),
    tags,
  };
}

/**
 * Categorize all emails and return stats.
 * Stats now count BOTH primary categories AND tags (which overlap).
 */
function categorizeAll(processedEmails) {
  const results = [];
  const stats = {
    // Primary category counts (mutually exclusive)
    googleWorkspace: 0,
    nonGoogle: 0,
    removed: 0,
    disposable: 0,
    needsReview: 0,

    // Tag counts (can overlap with primary)
    catchAll: 0,
    roleBased: 0,
    tradeBased: 0,
    fixed: 0,

    // Sub-category breakdowns (overlap tracking)
    googleWorkspaceTradeBased: 0,
    googleWorkspaceRoleBased: 0,
    googleWorkspaceCatchAll: 0,
    nonGoogleTradeBased: 0,
    nonGoogleRoleBased: 0,
    nonGoogleCatchAll: 0,

    total: processedEmails.length,
  };

  for (const record of processedEmails) {
    const categorization = categorizeEmail(record);
    const finalRecord = { ...record, categorization };
    results.push(finalRecord);

    const cat = categorization.category;
    const tags = categorization.tags || {};

    // Count primary category
    switch (cat) {
      case CATEGORIES.GOOGLE_WORKSPACE:
        stats.googleWorkspace++;
        if (tags.isTradeBased) stats.googleWorkspaceTradeBased++;
        if (tags.isRoleBased) stats.googleWorkspaceRoleBased++;
        if (tags.isCatchAll) stats.googleWorkspaceCatchAll++;
        break;
      case CATEGORIES.NON_GOOGLE:
        stats.nonGoogle++;
        if (tags.isTradeBased) stats.nonGoogleTradeBased++;
        if (tags.isRoleBased) stats.nonGoogleRoleBased++;
        if (tags.isCatchAll) stats.nonGoogleCatchAll++;
        break;
      case CATEGORIES.DISPOSABLE:
        stats.disposable++;
        stats.removed++;
        break;
      case CATEGORIES.REMOVED_FILTER_WORD:
      case CATEGORIES.REMOVED_BLOCKED_TLD:
      case CATEGORIES.REMOVED_INVALID_FORMAT:
      case CATEGORIES.REMOVED_DOMAIN_NOT_FOUND:
      case CATEGORIES.REMOVED_NO_MX:
        stats.removed++;
        break;
      case CATEGORIES.NEEDS_REVIEW:
        stats.needsReview++;
        break;
    }

    // Count tags (regardless of primary category)
    if (tags.isTradeBased) stats.tradeBased++;
    if (tags.isRoleBased) stats.roleBased++;
    if (tags.isCatchAll) stats.catchAll++;
    if (tags.isFixed && record.tldFixed) stats.fixed++;
  }

  return { results, stats };
}

module.exports = { categorizeAll, categorizeEmail, CATEGORIES, CATEGORY_LABELS };