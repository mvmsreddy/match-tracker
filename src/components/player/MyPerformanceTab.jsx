import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line,
  CartesianGrid, XAxis, YAxis, Tooltip,
} from 'recharts';
import { useSegment } from '../../context/SegmentContext';
import { GOVERNING_BODIES, circuitKey } from '../../lib/governingBodies';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function ChartTooltip({ active, payload, label, valueLabel }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="perf-tooltip">
      <div className="perf-tooltip-value">{payload[0].value}</div>
      <div className="perf-tooltip-label">{valueLabel} · {formatDate(label)}</div>
    </div>
  );
}

// "Browse any category" viewer — deliberately kept separate from the topbar
// segment switcher (PlayerDashboardShell). The topbar switcher changes which
// segment every OTHER tab is scoped to; this tab lets a player preview a
// category they aren't ranked in yet (e.g. before deciding to enter it, or
// checking a sibling age group/draw) without disturbing that shared
// selection — so it keeps its own local `selectedKey` instead of reading/
// writing SegmentContext's. Replaces the old Dashboard page's embedded
// PerformanceTab + its "Full multi-segment dashboard →" escape hatch and the
// AITA Rankings link that used to live only in primary nav.
export default function MyPerformanceTab() {
  const { bodyId, setBodyId, body, circuits, loading } = useSegment();
  const [selectedKey, setSelectedKey] = useState(null);

  const selectedCircuit = selectedKey ? circuits.find(c => c.key === selectedKey) || null : null;
  const selectedMeta = selectedKey ? body.categories.find(c => circuitKey(c.category, c.subcategory) === selectedKey) : null;
  const selectedLabel = selectedMeta ? selectedMeta.label : (selectedCircuit ? `${selectedCircuit.category} ${selectedCircuit.subcategory}` : '');

  if (loading) return <div className="history-empty">Loading performance…</div>;

  const bodyPills = (
    <div className="pcd-pill-row" style={{ width: 'fit-content' }}>
      {GOVERNING_BODIES.map(b => (
        <button
          key={b.id}
          className={`pcd-pill${b.id === bodyId ? ' active' : ''}`}
          disabled={!b.available}
          style={!b.available ? { opacity: 0.45, cursor: 'default' } : undefined}
          onClick={() => setBodyId(b.id)}
          title={b.available ? b.fullName : `${b.fullName} — coming soon`}
        >
          {b.label}{!b.available && ' · Soon'}
        </button>
      ))}
    </div>
  );

  if (selectedKey) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <button className="pcd-btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={() => setSelectedKey(null)}>← Back to browse</button>
        <div className="pcd-card-title">{selectedLabel}</div>

        {!selectedCircuit && (
          <div className="history-empty">
            No {selectedLabel} ranking history found for you yet. Check the full <Link to="/aita-rankings">AITA Rankings</Link> browser to see who's currently ranked.
          </div>
        )}

        {selectedCircuit && (
          <>
            <div className="pcd-stat-grid n4">
              <div className="pcd-stat-card"><div className="pcd-stat-card-label">Current rank</div><div className="pcd-stat-card-value">{selectedCircuit.latest.rank}</div></div>
              <div className="pcd-stat-card"><div className="pcd-stat-card-label">Current points</div><div className="pcd-stat-card-value">{selectedCircuit.latest.totalPoints}</div></div>
              <div className="pcd-stat-card"><div className="pcd-stat-card-label">Best rank</div><div className="pcd-stat-card-value">{selectedCircuit.bestRank}</div></div>
              <div className="pcd-stat-card"><div className="pcd-stat-card-label">Best points</div><div className="pcd-stat-card-value">{selectedCircuit.bestPoints}</div></div>
            </div>

            <div className="pcd-card">
              <div className="pcd-card-title" style={{ marginBottom: 4 }}>Points Growth</div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={selectedCircuit.points} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border2)" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={formatDate} stroke="var(--border)" tick={{ fill: 'var(--text4)', fontSize: 10 }} tickLine={false} minTickGap={40} />
                  <YAxis stroke="var(--border)" tick={{ fill: 'var(--text4)', fontSize: 10 }} tickLine={false} axisLine={false} width={44} domain={['auto', 'auto']} />
                  <Tooltip content={<ChartTooltip valueLabel="Points" />} cursor={{ stroke: 'var(--border)', strokeDasharray: '3 3' }} />
                  <Area type="monotone" dataKey="totalPoints" stroke="var(--accent)" strokeWidth={2} fill="var(--accent)" fillOpacity={0.1} dot={false} activeDot={{ r: 5, stroke: 'var(--bg2)', strokeWidth: 2, fill: 'var(--accent)' }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="pcd-card">
              <div className="pcd-card-title">Ranking Growth</div>
              <div className="pcd-card-sub" style={{ marginBottom: 12 }}>Lower is better — axis is inverted</div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={selectedCircuit.points} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border2)" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={formatDate} stroke="var(--border)" tick={{ fill: 'var(--text4)', fontSize: 10 }} tickLine={false} minTickGap={40} />
                  <YAxis reversed stroke="var(--border)" tick={{ fill: 'var(--text4)', fontSize: 10 }} tickLine={false} axisLine={false} width={44} domain={['auto', 'auto']} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip valueLabel="Rank" />} cursor={{ stroke: 'var(--border)', strokeDasharray: '3 3' }} />
                  <Line type="monotone" dataKey="rank" stroke="var(--win)" strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: 'var(--bg2)', strokeWidth: 2, fill: 'var(--win)' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {bodyPills}

      {!body.available && (
        <div className="history-empty">{body.fullName} rankings aren't wired up yet — check back soon.</div>
      )}

      {body.available && (
        <div className="pcd-card">
          <div className="pcd-card-title">Browse a category</div>
          <div className="pcd-card-sub" style={{ marginBottom: 14 }}>Preview any {body.fullName} category — including ones you're not ranked in yet</div>

          {circuits.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {circuits.map(c => (
                <button key={c.key} className="pcd-badge info" style={{ cursor: 'pointer', border: 0 }} onClick={() => setSelectedKey(c.key)}>
                  {c.category} {c.subcategory} · #{c.latest.rank}
                </button>
              ))}
            </div>
          )}

          <select
            className="pcd-segment-switcher-select"
            value=""
            onChange={e => { if (e.target.value) setSelectedKey(e.target.value); }}
          >
            <option value="">Select a category…</option>
            {body.categories.map(c => {
              const key = circuitKey(c.category, c.subcategory);
              const hasData = circuits.some(circ => circ.key === key);
              return <option key={key} value={key}>{c.label}{hasData ? ' ✓' : ''}</option>;
            })}
          </select>
        </div>
      )}

      <Link to="/aita-rankings" className="pcd-card-link" style={{ alignSelf: 'flex-start' }}>BROWSE FULL AITA RANKINGS TABLE →</Link>
    </div>
  );
}
