import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line,
  CartesianGrid, XAxis, YAxis, Tooltip,
} from 'recharts';
import { useSegment } from '../../context/SegmentContext';
import { GOVERNING_BODIES, circuitKey } from '../../lib/governingBodies';
import { Card } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function ChartTooltip({ active, payload, label, valueLabel }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-sm border border-border bg-popover text-popover-foreground px-3 py-2 text-xs">
      <div className="font-bold text-sm">{payload[0].value}</div>
      <div className="text-muted-foreground mt-0.5">{valueLabel} &middot; {formatDate(label)}</div>
    </div>
  );
}

// "Browse any category" viewer — deliberately kept separate from the topbar
// segment switcher (PlayerDashboardShell). The topbar switcher changes which
// segment every OTHER tab is scoped to; this tab lets a player preview a
// category they aren't ranked in yet without disturbing that shared
// selection — so it keeps its own local `selectedKey`.
export default function MyPerformanceTab() {
  const { bodyId, setBodyId, body, circuits, loading } = useSegment();
  const [selectedKey, setSelectedKey] = useState(null);

  const selectedCircuit = selectedKey ? circuits.find(c => c.key === selectedKey) || null : null;
  const selectedMeta = selectedKey ? body.categories.find(c => circuitKey(c.category, c.subcategory) === selectedKey) : null;
  const selectedLabel = selectedMeta ? selectedMeta.label : (selectedCircuit ? `${selectedCircuit.category} ${selectedCircuit.subcategory}` : '');

  if (loading) return <div className="text-sm text-muted-foreground">Loading performance…</div>;

  const bodyPills = (
    <div className="inline-flex flex-wrap border border-border rounded-sm p-1 bg-card gap-1 w-fit">
      {GOVERNING_BODIES.map(b => (
        <button
          key={b.id}
          className={`px-3 py-1.5 rounded-sm text-xs font-semibold transition-colors ${b.id === bodyId ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'} ${!b.available ? 'opacity-45 cursor-default' : ''}`}
          disabled={!b.available}
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
      <div className="space-y-4">
        <Button size="sm" variant="outline" className="w-fit" onClick={() => setSelectedKey(null)}>&larr; Back to browse</Button>
        <div className="font-bold text-sm">{selectedLabel}</div>

        {!selectedCircuit && (
          <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">
            No {selectedLabel} ranking history found for you yet. Check the full <Link to="/aita-rankings" className="text-primary hover:underline">AITA Rankings</Link> browser to see who's currently ranked.
          </div>
        )}

        {selectedCircuit && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="p-4"><div className="text-xs text-muted-foreground">Current rank</div><div className="font-display font-extrabold text-xl">{selectedCircuit.latest.rank}</div></Card>
              <Card className="p-4"><div className="text-xs text-muted-foreground">Current points</div><div className="font-display font-extrabold text-xl">{selectedCircuit.latest.totalPoints}</div></Card>
              <Card className="p-4"><div className="text-xs text-muted-foreground">Best rank</div><div className="font-display font-extrabold text-xl">{selectedCircuit.bestRank}</div></Card>
              <Card className="p-4"><div className="text-xs text-muted-foreground">Best points</div><div className="font-display font-extrabold text-xl">{selectedCircuit.bestPoints}</div></Card>
            </div>

            <Card className="p-4 sm:p-6">
              <div className="font-bold text-sm mb-1">Points Growth</div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={selectedCircuit.points} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={formatDate} stroke="var(--color-border)" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }} tickLine={false} minTickGap={40} />
                  <YAxis stroke="var(--color-border)" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }} tickLine={false} axisLine={false} width={44} domain={['auto', 'auto']} />
                  <Tooltip content={<ChartTooltip valueLabel="Points" />} cursor={{ stroke: 'var(--color-border)', strokeDasharray: '3 3' }} />
                  <Area type="monotone" dataKey="totalPoints" stroke="var(--color-primary)" strokeWidth={2} fill="var(--color-primary)" fillOpacity={0.1} dot={false} activeDot={{ r: 5, stroke: 'var(--color-card)', strokeWidth: 2, fill: 'var(--color-primary)' }} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-4 sm:p-6">
              <div className="font-bold text-sm">Ranking Growth</div>
              <div className="text-xs text-muted-foreground mb-3">Lower is better — axis is inverted</div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={selectedCircuit.points} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={formatDate} stroke="var(--color-border)" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }} tickLine={false} minTickGap={40} />
                  <YAxis reversed stroke="var(--color-border)" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }} tickLine={false} axisLine={false} width={44} domain={['auto', 'auto']} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip valueLabel="Rank" />} cursor={{ stroke: 'var(--color-border)', strokeDasharray: '3 3' }} />
                  <Line type="monotone" dataKey="rank" stroke="var(--color-chart-3)" strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: 'var(--color-card)', strokeWidth: 2, fill: 'var(--color-chart-3)' }} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {bodyPills}

      {!body.available && (
        <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">
          {body.fullName} rankings aren't wired up yet — check back soon.
        </div>
      )}

      {body.available && (
        <Card className="p-4 sm:p-6">
          <div className="font-bold text-sm">Browse a category</div>
          <div className="text-xs text-muted-foreground mb-4">Preview any {body.fullName} category — including ones you're not ranked in yet</div>

          {circuits.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {circuits.map(c => (
                <button
                  key={c.key}
                  className="rounded-sm px-2.5 py-1 text-xs font-semibold bg-blue-400/10 text-blue-400 hover:bg-blue-400/20"
                  onClick={() => setSelectedKey(c.key)}
                >
                  {c.category} {c.subcategory} &middot; #{c.latest.rank}
                </button>
              ))}
            </div>
          )}

          <select
            className="rounded-sm border border-input bg-transparent px-3 py-2 text-sm w-full sm:w-auto"
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
        </Card>
      )}

      <Link to="/aita-rankings" className="inline-block text-sm font-semibold text-primary hover:underline">
        Browse full AITA rankings table &rarr;
      </Link>
    </div>
  );
}
