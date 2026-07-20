export function reasonLabel(pt, selfName, oppName) {
  const name = pt.endedBy === 'self' ? selfName : oppName;
  const firstFaultNote = pt.firstFaultLocation ? ' [1st serve missed ' + pt.firstFaultLocation + ']' : '';
  if (pt.reason === 'DoubleFault') return name + ' double fault (2nd: ' + pt.location + ')' + firstFaultNote;
  if (pt.reason === 'Winner') return name + ' ' + pt.stroke.toLowerCase() + (pt.stroke === 'Serve' ? ' (ace)' : '') + ' winner' + (pt.isReturn ? ' (return)' : '') + firstFaultNote;
  const kind = pt.reason === 'ForcedError' ? 'forced error' : 'unforced error';
  const locSuffix = pt.location ? ' - ' + pt.location : '';
  return name + ' ' + pt.stroke.toLowerCase() + ' ' + kind + locSuffix + (pt.isReturn ? ' (return)' : '') + firstFaultNote;
}
