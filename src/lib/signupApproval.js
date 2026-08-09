/** Roles that require super_admin approval before the account is active. */
export const APPROVAL_REQUIRED_ROLES = new Set(['player', 'organizer']);

export function requiresSignupApproval(role) {
  return APPROVAL_REQUIRED_ROLES.has(role);
}

/** Cross-check a player's AITA reg against the reference table row shape. */
export function compareAitaPlayerProfile(profileRow, aitaRow) {
  if (!profileRow?.aitaReg || !aitaRow) {
    return { matched: false, issues: ['AITA registration not found in official player list'] };
  }
  const issues = [];
  const regOk = String(profileRow.aitaReg).trim() === String(aitaRow.regNo || '').trim();
  if (!regOk) issues.push('Registration number mismatch');

  const profileName = (profileRow.displayName || '').trim().toLowerCase();
  const aitaName = (aitaRow.name || '').trim().toLowerCase();
  if (profileName && aitaName) {
    const first = profileName.split(/\s+/)[0];
    if (first.length > 2 && !aitaName.includes(first)) {
      issues.push('Name may not match AITA record');
    }
  }

  return { matched: issues.length === 0, issues };
}
