import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Card } from '@/components/primitives/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/primitives/table';

const PAGE_SIZE = 50;

function formatDob(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

const selectCls = 'rounded-sm border border-input bg-transparent px-2.5 py-1.5 text-sm cursor-pointer';

export default function AitaRankingsPage() {
  const { user } = useAuth();
  const isOrganizer = user?.role === 'organizer';
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [facets, setFacets] = useState(null);
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [dates, setDates] = useState([]);
  const [date, setDate] = useState('');

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const [result, setResult] = useState(null); // { rows, totalCount }
  const [error, setError] = useState('');

  // Load the catalog of combos that actually have data, and default to the first one.
  useEffect(() => {
    api.listAitaRankingFacets()
      .then(list => {
        setFacets(list);
        if (list.length > 0) {
          setCategory(list[0].category);
          setSubcategory(list[0].subcategory);
        }
      })
      .catch(e => setError(e.message || 'Could not load AITA rankings'));
  }, []);

  // Keep subcategory valid whenever category changes (default to its first option).
  useEffect(() => {
    if (!facets || !category) return;
    const options = [...new Set(facets.filter(f => f.category === category).map(f => f.subcategory))];
    if (!options.includes(subcategory)) setSubcategory(options[0] || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facets, category]);

  // Load available dates whenever the combo changes, default to the latest.
  useEffect(() => {
    if (!category || !subcategory) return;
    setDate('');
    setDates([]);
    api.listAitaRankingDates(category, subcategory)
      .then(list => {
        setDates(list);
        if (list.length > 0) setDate(list[0]);
      })
      .catch(e => setError(e.message || 'Could not load ranking dates'));
  }, [category, subcategory]);

  // Debounce free-text search.
  useEffect(() => {
    const handle = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  // Reset to page 1 whenever the snapshot or search term changes.
  useEffect(() => { setPage(0); }, [category, subcategory, date, search]);

  useEffect(() => {
    if (!category || !subcategory || !date) return;
    setResult(null);
    api.listAitaRankings({ category, subcategory, date, search: search || undefined, page, pageSize: PAGE_SIZE })
      .then(setResult)
      .catch(e => setError(e.message || 'Could not load rankings'));
  }, [category, subcategory, date, search, page]);

  const subcategoryOptions = facets ? [...new Set(facets.filter(f => f.category === category).map(f => f.subcategory))] : [];
  const totalPages = result ? Math.max(1, Math.ceil(result.totalCount / PAGE_SIZE)) : 1;

  async function handleSyncNow() {
    if (syncing) return;
    setSyncing(true);
    setSyncMessage('');
    try {
      const result = await api.triggerAitaRankingsSync();
      const rows = (result?.summary || []).reduce((sum, s) => sum + (s.rowsUpserted || 0), 0);
      const newDatesCount = (result?.summary || []).reduce((sum, s) => sum + (s.datesUpserted || 0), 0);
      setSyncMessage(newDatesCount > 0 ? `Synced — ${newDatesCount} new date(s), ${rows} rows.` : 'Synced — no new rankings published since last check.');
      if (category && subcategory) {
        api.listAitaRankingDates(category, subcategory).then(list => {
          setDates(list);
          if (list.length > 0 && !list.includes(date)) setDate(list[0]);
        });
      }
    } catch (e) {
      setSyncMessage(e.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">Mirrored from aitatennis.com</div>
          <h1 className="font-display font-extrabold text-2xl sm:text-3xl tracking-tighter">AITA Rankings</h1>
        </div>
        {isOrganizer && (
          <Button onClick={handleSyncNow} disabled={syncing}>
            {syncing ? 'Syncing…' : '⟳ Sync Now'}
          </Button>
        )}
      </div>

      {syncMessage && (
        <div className="border border-border bg-muted/40 rounded-sm p-3 text-sm text-muted-foreground">{syncMessage}</div>
      )}

      {error && (
        <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">{error}</div>
      )}

      {facets && facets.length === 0 && !error && (
        <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">No ranking categories loaded yet.</div>
      )}

      {facets && facets.length > 0 && (
        <>
          <Card className="p-4 shadow-sm">
            <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-3">Filters</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              <select className={selectCls + ' w-full'} value={category} onChange={e => setCategory(e.target.value)}>
                {[...new Set(facets.map(f => f.category))].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select className={selectCls + ' w-full'} value={subcategory} onChange={e => setSubcategory(e.target.value)}>
                {subcategoryOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select className={selectCls + ' w-full'} value={date} onChange={e => setDate(e.target.value)}>
                {dates.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <Input
                type="text"
                placeholder="Search player…"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                className="w-full"
              />
            </div>
            {result && (
              <div className="text-xs text-muted-foreground mt-3 font-semibold">
                📊 {result.totalCount.toLocaleString()} player{result.totalCount === 1 ? '' : 's'} found
              </div>
            )}
          </Card>

          {result === null && (
            <Card className="p-6 text-center border-2 border-dashed">
              <div className="text-sm text-muted-foreground">Loading rankings…</div>
            </Card>
          )}

          {result && result.rows.length === 0 && (
            <Card className="p-6 text-center border-2 border-dashed">
              <div className="text-sm text-muted-foreground">No players found.</div>
            </Card>
          )}

          {result && result.rows.length > 0 && (
            <>
              {/* Desktop Table View */}
              <div className="hidden md:block rounded-lg border border-border overflow-x-auto shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rank</TableHead>
                      <TableHead>Player</TableHead>
                      <TableHead>Reg No.</TableHead>
                      <TableHead>DOB</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Singles</TableHead>
                      <TableHead>Doubles</TableHead>
                      <TableHead>25% Best Dbls</TableHead>
                      <TableHead>Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.rows.map(r => (
                      <TableRow key={r.id} className="hover:bg-muted/30">
                        <TableCell className="font-bold">
                          {r.rank <= 3 ? (
                            <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full font-bold text-xs ${
                              r.rank === 1 ? 'bg-yellow-500/20 text-yellow-500' :
                              r.rank === 2 ? 'bg-gray-400/20 text-gray-300' :
                              'bg-orange-500/20 text-orange-500'
                            }`}>#{r.rank}</span>
                          ) : (
                            <span>#{r.rank}</span>
                          )}
                        </TableCell>
                        <TableCell className="font-bold">{r.playerName}</TableCell>
                        <TableCell className="text-muted-foreground">{r.regNo || '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDob(r.dob)}</TableCell>
                        <TableCell>
                          {r.state ? (
                            <span className="inline-flex items-center rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-xs font-semibold">{r.state}</span>
                          ) : '—'}
                        </TableCell>
                        <TableCell>{r.pointsBreakdown?.singlesPts ?? '—'}</TableCell>
                        <TableCell>{r.pointsBreakdown?.doublesPts ?? '—'}</TableCell>
                        <TableCell>{r.pointsBreakdown?.best25DoublesPts ?? '—'}</TableCell>
                        <TableCell className="font-bold text-primary">{r.totalPoints}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden space-y-2.5">
                {result.rows.map(r => (
                  <div 
                    key={r.id} 
                    className={`p-4 rounded-lg border bg-card hover:border-primary transition-all ${
                      r.rank <= 3 ? 'border-l-4' : 'border-l-4 border-l-transparent'
                    } ${
                      r.rank === 1 ? 'border-l-yellow-500' :
                      r.rank === 2 ? 'border-l-gray-400' :
                      r.rank === 3 ? 'border-l-orange-500' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm ${
                          r.rank === 1 ? 'bg-yellow-500/20 text-yellow-500' :
                          r.rank === 2 ? 'bg-gray-400/20 text-gray-300' :
                          r.rank === 3 ? 'bg-orange-500/20 text-orange-500' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          #{r.rank}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-sm truncate">{r.playerName}</div>
                          <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-1.5 items-center">
                            {r.regNo && <span>Reg: {r.regNo}</span>}
                            {r.state && (
                              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold">{r.state}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-display font-extrabold text-xl tracking-tighter text-primary">{r.totalPoints}</div>
                        <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">pts</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-border">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Singles</div>
                        <div className="text-sm font-semibold mt-0.5">{r.pointsBreakdown?.singlesPts ?? '—'}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Doubles</div>
                        <div className="text-sm font-semibold mt-0.5">{r.pointsBreakdown?.doublesPts ?? '—'}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">25% Best</div>
                        <div className="text-sm font-semibold mt-0.5">{r.pointsBreakdown?.best25DoublesPts ?? '—'}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>← Prev</Button>
                <span className="text-xs text-muted-foreground font-semibold">Page {page + 1} of {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</Button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
