import { useSegment } from '../../context/SegmentContext';
import { GOVERNING_BODIES } from '../../lib/governingBodies';

// Generalized version of PerformanceTab's pill-row + CircuitCard grid, driven
// by SegmentContext instead of local component state, so every segment-scoped
// tab (Overview/Tournaments/Training/...) shares one picker. Segments here are
// fully independent circuits — see src/lib/segments.js — this never merges or
// ranks them against each other.
export default function SegmentPicker() {
  const { bodyId, setBodyId, body, circuits, loading, selectedKey, setSelectedKey } = useSegment();

  return (
    <div className="perf-body-row">
      {GOVERNING_BODIES.map(b => (
        <button
          key={b.id}
          className={`perf-body-pill${b.id === bodyId ? ' active' : ''}${!b.available ? ' disabled' : ''}`}
          disabled={!b.available}
          onClick={() => { setBodyId(b.id); setSelectedKey(null); }}
          title={b.available ? b.fullName : `${b.fullName} — coming soon`}
        >
          {b.label}{!b.available && <span className="perf-soon"> · Soon</span>}
        </button>
      ))}

      {body.available && !loading && circuits.length > 0 && (
        <select
          className="t-badge"
          style={{ cursor: 'pointer', marginLeft: 'auto' }}
          value={selectedKey || ''}
          onChange={e => setSelectedKey(e.target.value || null)}
        >
          {circuits.map(c => (
            <option key={c.key} value={c.key}>{c.category} {c.subcategory}</option>
          ))}
        </select>
      )}
    </div>
  );
}
