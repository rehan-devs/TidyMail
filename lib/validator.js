'use strict';

/**
 * RFC 5322 email format validator - built from scratch.
 * No libraries. Pure logic.
 */

// Valid characters in local part (unquoted)
const LOCAL_PART_ALLOWED = /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~.\-]+$/;

// Valid characters in domain label
const DOMAIN_LABEL_ALLOWED = /^[a-zA-Z0-9\-]+$/;

// TLD must be all alphabetic, at least 2 chars
const TLD_PATTERN = /^[a-zA-Z]{2,}$/;

/**
 * Validate local part of email
 */
function validateLocalPart(local) {
  const issues = [];

  if (!local || local.length === 0) {
    issues.push('Local part is empty');
    return issues;
  }

  if (local.length > 64) {
    issues.push(`Local part too long: ${local.length} chars (max 64)`);
  }

  // Check for invalid characters
  if (!LOCAL_PART_ALLOWED.test(local)) {
    // Find the bad character
    const badChars = local.split('').filter(c => !/[a-zA-Z0-9!#$%&'*+/=?^_`{|}~.\-]/.test(c));
    issues.push(`Invalid characters in local part: ${[...new Set(badChars)].map(c => `"${c}"`).join(', ')}`);
  }

  // Cannot start with a dot
  if (local.startsWith('.')) {
    issues.push('Local part cannot start with a dot');
  }

  // Cannot end with a dot
  if (local.endsWith('.')) {
    issues.push('Local part cannot end with a dot');
  }

  // Cannot have consecutive dots
  if (local.includes('..')) {
    issues.push('Local part cannot contain consecutive dots');
  }

  // Cannot be all dots
  if (/^\.+$/.test(local)) {
    issues.push('Local part cannot consist only of dots');
  }

  return issues;
}

/**
 * Validate domain part of email
 */
function validateDomain(domain) {
  const issues = [];

  if (!domain || domain.length === 0) {
    issues.push('Domain is empty');
    return issues;
  }

  // Must contain at least one dot
  if (!domain.includes('.')) {
    issues.push('Domain must contain at least one dot');
    return issues;
  }

  // Cannot start or end with a dot
  if (domain.startsWith('.')) {
    issues.push('Domain cannot start with a dot');
  }
  if (domain.endsWith('.')) {
    issues.push('Domain cannot end with a dot');
  }

  // Cannot start or end with a hyphen (at the domain level)
  if (domain.startsWith('-') || domain.endsWith('-')) {
    issues.push('Domain cannot start or end with a hyphen');
  }

  const labels = domain.split('.');

  if (labels.length < 2) {
    issues.push('Domain must have at least two parts');
    return issues;
  }

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];

    if (label.length === 0) {
      issues.push(`Empty label found at position ${i + 1} in domain`);
      continue;
    }

    if (label.length > 63) {
      issues.push(`Domain label "${label}" too long (max 63 chars)`);
    }

    if (!DOMAIN_LABEL_ALLOWED.test(label)) {
      const badChars = label.split('').filter(c => !/[a-zA-Z0-9\-]/.test(c));
      issues.push(`Invalid characters in domain label "${label}": ${[...new Set(badChars)].map(c => `"${c}"`).join(', ')}`);
    }

    if (label.startsWith('-')) {
      issues.push(`Domain label "${label}" cannot start with a hyphen`);
    }

    if (label.endsWith('-')) {
      issues.push(`Domain label "${label}" cannot end with a hyphen`);
    }
  }

  // Validate TLD (last label)
  const tld = labels[labels.length - 1];
  if (!TLD_PATTERN.test(tld)) {
    issues.push(`Invalid TLD "${tld}": must be 2+ alphabetic characters only`);
  }

  return issues;
}

/**
 * Full email validation
 */
function validateEmail(email) {
  const issues = [];

  if (!email || typeof email !== 'string') {
    return { isValid: false, issues: ['Email is empty or not a string'] };
  }

  // Total length check
  if (email.length > 254) {
    issues.push(`Email too long: ${email.length} chars (max 254)`);
  }

  // Must have exactly one @
  const atCount = (email.match(/@/g) || []).length;
  if (atCount === 0) {
    return { isValid: false, issues: ['No @ symbol found'] };
  }
  if (atCount > 1) {
    return { isValid: false, issues: [`Multiple @ symbols found: ${atCount}`] };
  }

  const atIdx = email.indexOf('@');
  const localPart = email.slice(0, atIdx);
  const domain = email.slice(atIdx + 1);

  // Validate each part
  const localIssues = validateLocalPart(localPart);
  const domainIssues = validateDomain(domain);

  issues.push(...localIssues);
  issues.push(...domainIssues);

  // Additional common sense checks
  if (localPart.length + domain.length + 1 > 254) {
    issues.push('Total email length exceeds 254 characters');
  }

  // Detect obvious fake patterns
  if (/^(test|fake|dummy|placeholder|example|sample|noemail|none|null|undefined|na|n\/a)@/i.test(email)) {
    issues.push('Local part appears to be a placeholder value');
  }

  // Check for obviously invalid domains
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(domain)) {
    issues.push('Domain is a local/loopback address');
  }

  // Detect IP address as domain (not standard for email)
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(domain)) {
    issues.push('Domain appears to be an IP address (not standard)');
  }

  return {
    isValid: issues.length === 0,
    issues,
  };
}

/**
 * Quick format check - faster version for bulk processing
 */
function quickValidate(email) {
  if (!email || email.length > 254 || email.length < 6) return false;
  const atIdx = email.indexOf('@');
  if (atIdx < 1 || atIdx !== email.lastIndexOf('@')) return false;
  const local = email.slice(0, atIdx);
  const domain = email.slice(atIdx + 1);
  if (local.length > 64 || local.length < 1) return false;
  if (!domain.includes('.')) return false;
  if (domain.startsWith('.') || domain.endsWith('.')) return false;
  if (local.startsWith('.') || local.endsWith('.')) return false;
  if (local.includes('..') || domain.includes('..')) return false;
  const tld = domain.split('.').pop();
  if (tld.length < 2 || !/^[a-zA-Z]+$/.test(tld)) return false;
  return true;
}

module.exports = { validateEmail, quickValidate, validateLocalPart, validateDomain };