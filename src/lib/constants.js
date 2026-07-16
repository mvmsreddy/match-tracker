export const FORMAT_PRESETS = {
  'bo3-full': { label: 'Best of 3 sets', setsToWin: 2, gamesTarget: 6, decider: 'full' },
  'bo3-mtb10': { label: 'Best of 3 sets (Match Tiebreak-10 decider)', setsToWin: 2, gamesTarget: 6, decider: 'mtb10' },
  'bo5-full': { label: 'Best of 5 sets', setsToWin: 3, gamesTarget: 6, decider: 'full' },
  'proset8': { label: 'Pro-set (first to 8 games)', setsToWin: 1, gamesTarget: 8, decider: 'full' },
  'shortsets4': { label: 'Short Sets (best of 3, first to 4 games)', setsToWin: 2, gamesTarget: 4, decider: 'full' },
  'custom': { label: 'Custom', setsToWin: 2, gamesTarget: 6, decider: 'full' },
};

export function getFormatConfig(formatPreset) {
  return FORMAT_PRESETS[formatPreset] || FORMAT_PRESETS['bo3-full'];
}

export const SHOT_TYPES = ['Ground', 'Slice', 'Volley', 'Smash', 'Lob', 'Passing Shot', 'Dropshot', 'Other'];

export const SHOT_CATEGORIES = [];
SHOT_TYPES.forEach((t) => {
  SHOT_CATEGORIES.push(t + ' Forehand');
  SHOT_CATEGORIES.push(t + ' Backhand');
});

export function strokeSide(stroke) {
  return stroke && stroke.endsWith('Backhand') ? 'Backhand' : (stroke && stroke.endsWith('Forehand') ? 'Forehand' : null);
}

export const STROKE_ADVICE = {
  'Forehand-Net': 'raise net clearance, check contact point height',
  'Forehand-Wide': 'tighten aim margins, especially cross-court',
  'Forehand-Long': 'add top-spin, shorten the swing on flat balls',
  'Backhand-Net': 'raise net clearance on low or short balls',
  'Backhand-Wide': 'check footwork and positioning before contact',
  'Backhand-Long': 'take some pace off, add spin for control',
  'Serve-Net': 'check toss placement and swing path',
  'Serve-Wide': 'reduce pace for a higher-margin first serve',
  'Serve-Long': 'reduce pace for a higher-margin first serve',
  'Volley-Net': 'work on early preparation, punch through contact',
  'Volley-Wide': 'tighten angles, take the ball earlier',
  'Volley-Long': 'soften the hands, take pace off the punch',
  'Smash-Net': 'get fully under the ball before contact',
  'Smash-Wide': 'improve footwork to get set before swinging',
  'Smash-Long': 'take some pace off, focus on placement',
  'Slice-Net': 'raise net clearance, stay through the shot longer',
  'Slice-Wide': 'tighten the target margin, flatten the angle less',
  'Slice-Long': 'shorten the follow-through, keep the trajectory lower',
  'Lob-Net': 'get more height early, clear the net by a bigger margin',
  'Lob-Wide': 'aim more centrally, reduce sideline risk',
  'Lob-Long': 'take some pace off, focus on depth control',
  'Dropshot-Net': 'soften the touch, disguise the shot later',
  'Dropshot-Wide': 'aim closer to the center of the box',
  'Dropshot-Long': 'take more pace off, feel the ball more',
  'Passing Shot-Net': 'raise net clearance, pick the moment more carefully',
  'Passing Shot-Wide': 'tighten the angle, aim inside the lines',
  'Passing Shot-Long': 'take some pace off, prioritize placement',
};

export function adviceForStroke(stroke, loc) {
  if (stroke === 'Second Serve') stroke = 'Serve';
  if (STROKE_ADVICE[stroke + '-' + loc]) return STROKE_ADVICE[stroke + '-' + loc];
  const side = strokeSide(stroke);
  const shotType = side ? stroke.slice(0, stroke.length - side.length).trim() : stroke;
  if (STROKE_ADVICE[shotType + '-' + loc]) return STROKE_ADVICE[shotType + '-' + loc];
  if (side && STROKE_ADVICE[side + '-' + loc]) return STROKE_ADVICE[side + '-' + loc];
  return 'work on consistency in this situation';
}

export const STROKE_OPTIONS = SHOT_TYPES; // shot-type step in the wizard
export const SIDE_OPTIONS = ['Forehand', 'Backhand'];
export const LOCATIONS = ['Net', 'Wide', 'Long'];
