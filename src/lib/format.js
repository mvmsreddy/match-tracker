export function reasonLabel(pt, selfName, oppName) {
  const name = pt.endedBy === 'self' ? selfName : oppName;
  // Basic/Advanced tracking tiers don't always capture shot type — fall back
  // to a generic label rather than assuming pt.stroke is always a string.
  const stroke = pt.stroke ? pt.stroke.toLowerCase() : 'shot';
  const firstFaultNote = pt.firstFaultLocation ? ' [1st serve missed ' + pt.firstFaultLocation + ']' : '';
  const infractionNote = pt.infraction ? ' [' + pt.infraction + ']' : '';
  if (pt.reason === 'DoubleFault') return name + ' double fault (2nd: ' + pt.location + ')' + firstFaultNote;
  if (pt.reason === 'Winner') return name + ' ' + stroke + (pt.stroke === 'Serve' ? ' (ace)' : '') + ' winner' + (pt.isReturn ? ' (return)' : '') + firstFaultNote + infractionNote;
  const kind = pt.reason === 'ForcedError' ? 'forced error' : 'unforced error';
  const locSuffix = pt.location ? ' - ' + pt.location : '';
  return name + ' ' + stroke + ' ' + kind + locSuffix + (pt.isReturn ? ' (return)' : '') + firstFaultNote + infractionNote;
}
