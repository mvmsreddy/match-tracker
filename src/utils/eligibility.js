// ============================================================
// Age eligibility — requirements §4.2
// Age is calculated from DOB as of January 1 of the tournament year.
// Playing UP (younger player entering an older group) is always allowed
// unless the organizer turns it off; playing DOWN is blocked unless the
// organizer explicitly allows it.
// ============================================================

const AGE_GROUP_ORDER = ['U10', 'U12', 'U14', 'U16', 'U18', 'Open'];

function ageAsOfJan1(dateOfBirth, tournamentYear) {
  const dob = new Date(dateOfBirth + 'T00:00:00');
  let age = tournamentYear - dob.getFullYear();
  const bornOnJan1 = dob.getMonth() === 0 && dob.getDate() === 1;
  if (!bornOnJan1) age -= 1;
  return age;
}

// Smallest age group this DOB naturally qualifies for (§4.2 bands).
export function minEligibleAgeGroup(dateOfBirth, tournamentYear) {
  const age = ageAsOfJan1(dateOfBirth, tournamentYear);
  if (age <= 10) return 'U10';
  if (age <= 12) return 'U12';
  if (age <= 14) return 'U14';
  if (age <= 16) return 'U16';
  if (age <= 18) return 'U18';
  return 'Open';
}

// Returns { allowed, reason }. reason is only set when allowed is false.
export function checkAgeEligibility(dateOfBirth, eventAgeGroup, tournamentYear, playingUpAllowed, playingDownAllowed) {
  if (!dateOfBirth || !eventAgeGroup) return { allowed: true };

  const minGroup = minEligibleAgeGroup(dateOfBirth, tournamentYear);
  const minIdx = AGE_GROUP_ORDER.indexOf(minGroup);
  const eventIdx = AGE_GROUP_ORDER.indexOf(eventAgeGroup);
  if (minIdx === -1 || eventIdx === -1 || eventIdx === minIdx) return { allowed: true };

  if (eventIdx > minIdx) {
    // Playing up — allowed by default.
    if (playingUpAllowed === false) {
      return { allowed: false, reason: `Player's age group is ${minGroup} — playing up to ${eventAgeGroup} is not allowed for this tournament.` };
    }
    return { allowed: true };
  }

  // Playing down — blocked by default.
  if (playingDownAllowed) return { allowed: true };
  return { allowed: false, reason: `Player's age group is ${minGroup} — too old for ${eventAgeGroup} (playing down is not allowed).` };
}
