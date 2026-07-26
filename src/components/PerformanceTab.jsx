import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line,
  CartesianGrid, XAxis, YAxis, Tooltip,
} from 'recharts';
import * as api from '../api';
import { GOVERNING_BODIES, findGoverningBody, circuitKey } from '../lib/governingBodies';
import { buildCircuits } from '../lib/segments';

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

function CircuitCard({ circuit, onClick }) {
  const { latest, previous, bestRank } = circuit;
  const rankDelta = previous ? previous.rank - latest.rank : 0; // positive = improved (rank number went down)
  return (
    <button className="perf-circuit-card" onClick={onClick}>
      <div className="perf-circuit-title">{circuit.category} {circuit.subcategory}</div>
      <div className="perf-circuit-stats">
        <div>
          <div className="perf-circuit-value">{latest.rank}</div>
          <div className="perf-circuit-label">Rank</div>
        </div>
        <div>
          <div className="perf-circuit-value">{latest.totalPoints}</div>
          <div className="perf-circuit-label">Points</div>
        </div>
      </div>
      {rankDelta !== 0 && (
        <div className={`perf-circuit-trend ${rankDelta > 0 ? 'up' : 'down'}`}>
          {rankDelta > 0 ? '▲' : '▼'} {Math.abs(rankDelta)} since last update
        </div>
      )}
      <div className="perf-circuit-meta">As of {formatDate(latest.date)} · Best rank {bestRank}</div>
    </button>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="perf-stat">
      <div className={`perf-stat-value${accent ? ' accent' : ''}`}>{value}</div>
      <div className="perf-stat-label">{label}</div>
    </div>
  );
}

function CircuitDetail({ circuit, label, aitaReg, onBack }) {
  return (
    <div className="perf-detail">
      <button className="action-btn" onClick={onBack}>← Back to circuits</button>
      <div className="dashboard-section-title" style={{ marginTop: 14 }}>{label}</div>

      {!circuit && (
        <div className="history-empty">No ranking history found for reg {aitaReg} in {label} yet.</div>
      )}

      {circuit && (
        <>
          <div className="perf-stat-strip">
            <Stat label="Current Rank" value={circuit.latest.rank} />
            <Stat label="Current Points" value={circuit.latest.totalPoints} />
            <Stat label="Best Rank" value={circuit.bestRank} accent />
            <Stat label="Best Points" value={circuit.bestPoints} />
            <Stat label="First Seen" value={formatDate(circuit.firstSeen)} />
            <Stat label="Snapshots" value={circuit.snapshotCount} />
          </div>

          <div className="perf-chart-card">
            <div className="perf-chart-title">Points Growth</div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={circuit.points} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="var(--border2)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatDate} stroke="var(--border)" tick={{ fill: 'var(--text4)', fontSize: 10 }} tickLine={false} minTickGap={40} />
                <YAxis stroke="var(--border)" tick={{ fill: 'var(--text4)', fontSize: 10 }} tickLine={false} axisLine={false} width={44} domain={['auto', 'auto']} />
                <Tooltip content={<ChartTooltip valueLabel="Points" />} cursor={{ stroke: 'var(--border)', strokeDasharray: '3 3' }} />
                <Area
                  type="monotone" dataKey="totalPoints"
                  stroke="var(--accent)" strokeWidth={2}
                  fill="var(--accent)" fillOpacity={0.1}
                  dot={false} activeDot={{ r: 5, stroke: 'var(--bg2)', strokeWidth: 2, fill: 'var(--accent)' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="perf-chart-card">
            <div className="perf-chart-title">Ranking Growth</div>
            <div className="perf-chart-subtitle">Lower is better — axis is inverted</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={circuit.points} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="var(--border2)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatDate} stroke="var(--border)" tick={{ fill: 'var(--text4)', fontSize: 10 }} tickLine={false} minTickGap={40} />
                <YAxis reversed stroke="var(--border)" tick={{ fill: 'var(--text4)', fontSize: 10 }} tickLine={false} axisLine={false} width={44} domain={['auto', 'auto']} allowDecimals={false} />
                <Tooltip content={<ChartTooltip valueLabel="Rank" />} cursor={{ stroke: 'var(--border)', strokeDasharray: '3 3' }} />
                <Line
                  type="monotone" dataKey="rank"
                  stroke="var(--win)" strokeWidth={2}
                  dot={false} activeDot={{ r: 5, stroke: 'var(--bg2)', strokeWidth: 2, fill: 'var(--win)' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <Link to="/aita-rankings" className="dashboard-view-all">View full rankings table →</Link>
        </>
      )}
    </div>
  );
}

export default function PerformanceTab({ aitaReg }) {
  const [bodyId, setBodyId] = useState('AITA');
  const [history, setHistory] = useState(null); // null = loading
  const [error, setError] = useState('');
  const [selectedKey, setSelectedKey] = useState(null);

  const body = findGoverningBody(bodyId);

  useEffect(() => {
    if (!aitaReg) { setHistory([]); return; }
    let cancelled = false;
    setHistory(null);
    setSelectedKey(null);
    api.getPlayerAitaRankingHistory(aitaReg)
      .then(data => { if (!cancelled) setHistory(data); })
      .catch(e => { if (!cancelled) { setError(e.message || 'Could not load ranking history'); setHistory([]); } });
    return () => { cancelled = true; };
  }, [aitaReg]);

  const circuits = useMemo(() => buildCircuits(history || []), [history]);
  const selectedCircuit = selectedKey ? circuits.find(c => c.key === selectedKey) : null;
  const selectedMeta = selectedKey ? body.categories.find(c => circuitKey(c.category, c.subcategory) === selectedKey) : null;
  const selectedLabel = selectedMeta ? selectedMeta.label : (selectedCircuit ? `${selectedCircuit.category} ${selectedCircuit.subcategory}` : '');

  return (
    <div className="perf-tab">
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
      </div>

      {!aitaReg && (
        <div className="history-empty">
          Add your AITA registration number in <Link to="/profile">your profile</Link> to see ranking performance.
        </div>
      )}

      {aitaReg && !body.available && (
        <div className="history-empty">{body.fullName} rankings aren't wired up yet — check back soon.</div>
      )}

      {aitaReg && body.available && (
        <>
          {error && <div className="history-empty">{error}</div>}
          {history === null && !error && <div className="history-empty">Loading ranking history…</div>}

          {history !== null && !selectedKey && (
            <>
              {circuits.length === 0 ? (
                <div className="history-empty">
                  No {body.label} ranking history found yet for reg {aitaReg}. This can happen if backfill
                  hasn't reached your category yet — check the full <Link to="/aita-rankings">AITA Rankings</Link> browser.
                </div>
              ) : (
                <>
                  <div className="dashboard-section-title" style={{ marginTop: 4 }}>My Circuits</div>
                  <div className="perf-circuit-grid">
                    {circuits.map(c => (
                      <CircuitCard key={c.key} circuit={c} onClick={() => setSelectedKey(c.key)} />
                    ))}
                  </div>
                </>
              )}

              <div className="dashboard-section-title" style={{ marginTop: 20 }}>Browse Another Category</div>
              <select
                className="t-badge"
                style={{ cursor: 'pointer', margin: '0 16px 16px' }}
                value=""
                onChange={e => { if (e.target.value) setSelectedKey(e.target.value); }}
              >
                <option value="">Select category…</option>
                {body.categories.map(c => {
                  const key = circuitKey(c.category, c.subcategory);
                  const hasData = circuits.some(circ => circ.key === key);
                  return <option key={key} value={key}>{c.label}{hasData ? ' ✓' : ''}</option>;
                })}
              </select>
            </>
          )}

          {history !== null && selectedKey && (
            <CircuitDetail circuit={selectedCircuit} label={selectedLabel} aitaReg={aitaReg} onBack={() => setSelectedKey(null)} />
          )}
        </>
      )}
    </div>
  );
}
