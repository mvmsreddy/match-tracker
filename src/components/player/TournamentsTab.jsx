import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../../api';
import { normalizeEventSegment } from '../../lib/governingBodies';
import { todayLocalIso, toLocalIso } from '../../lib/dates';
import { usePlayerTournamentEntries } from '../../hooks/usePlayerTournamentEntries';
import TournamentMatches, { formatDate } from '../tournaments/TournamentMatches';
import MatchDetailModal from './MatchDetailModal';
import { Badge } from '@/components/primitives/badge';

const RESULTS_UPLOAD_STATUS_LABEL = {
  pending_review: 'Uploaded — waiting for admin review',
  rejected: "That upload wasn't applied — try again below",
  applied: 'Applied — thanks!',
};

// Results-sheet upload for a crowdsourced (phase 45) tournament — AITA
// doesn't give us live results for these, so any matched player in the draw
// can upload an EOD results photo/PDF; a super_admin transcribes it into
// the bracket from the admin review queue. Only rendered for
// week.source === 'aita_crowdsourced' (see below); organiser-run events get
// their scores from the organiser directly and don't need this.
function ResultsSheetUploader({ eventId }) {
  const [uploads, setUploads] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  function reload() {
    return api.getMyAitaResultsUploads(eventId).then(setUploads).catch(() => setUploads([]));
  }

  useEffect(() => { reload(); }, [eventId]);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      await api.uploadAitaResultsSheet(eventId, file);
      await reload();
    } catch (err) {
      setError(err.message || 'Upload failed — try again');
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  if (uploads === null) return null;
  const latest = uploads[0] || null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs p-3 rounded-sm bg-secondary/50 mb-2">
      <span className="font-semibold">Results sheet:</span>
      {latest && <span className="text-muted-foreground">{RESULTS_UPLOAD_STATUS_LABEL[latest.status] || latest.status}</span>}
      <label className={`inline-flex items-center gap-1.5 rounded-sm border border-dashed border-border px-2.5 py-1 font-semibold cursor-pointer hover:border-primary ${busy ? 'opacity-60 pointer-events-none' : ''}`}>
        {busy ? 'Uploading…' : 'Upload today’s results'}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={handleFileChange}
          disabled={busy}
        />
      </label>
      {error && <span className="text-destructive">{error}</span>}
    </div>
  );
}

// Segment-filtered tournament history. Each entry expands to its matches
// (fetched on demand) rather than eagerly loading every entry's matches up
// front.
export default function TournamentsTab({ circuit, playerId, isOwnDashboard = true, selfName = 'You' }) {
  const { entries, error } = usePlayerTournamentEntries(playerId);
  const [trackedMatches, setTrackedMatches] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [modalMatch, setModalMatch] = useState(null);
  // Historical filter — 'all' | 'this-year' | 'last-12m' | 'year:YYYY' | 'month:YYYY-MM' | 'range'
  const [filter, setFilter] = useState('all');
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.getMatchesForSegment(playerId, circuit.category, circuit.subcategory)
      .then(data => { if (!cancelled) setTrackedMatches(data); })
      .catch(() => { if (!cancelled) setTrackedMatches([]); });
    return () => { cancelled = true; };
  }, [playerId, circuit.category, circuit.subcategory]);

  const trackedByEventMatch = useMemo(() => new Map(
    (trackedMatches || []).filter(m => m.eventMatchId && m.points?.length > 0).map(m => [m.eventMatchId, m])
  ), [trackedMatches]);

  const segmentEntries = useMemo(() => {
    if (!entries) return [];
    return entries
      .filter(e => e.event)
      .filter(e => {
        const seg = normalizeEventSegment(e.event.category, e.event.ageGroup);
        return seg && seg.category === circuit.category && seg.subcategory === circuit.subcategory;
      })
      .sort((a, b) => (b.event.week?.startDate || '').localeCompare(a.event.week?.startDate || ''));
  }, [entries, circuit]);

  // Every year/month a segment entry falls in — powers the historical filter pills.
  const filterFacets = useMemo(() => {
    const years = new Set();
    const months = new Set(); // YYYY-MM
    for (const e of segmentEntries) {
      const d = e.event.week?.startDate;
      if (!d) continue;
      years.add(d.slice(0, 4));
      months.add(d.slice(0, 7));
    }
    return {
      years: [...years].sort().reverse(),
      months: [...months].sort().reverse().slice(0, 12), // show last 12 months max
    };
  }, [segmentEntries]);

  const filteredEntries = useMemo(() => {
    if (filter === 'all') return segmentEntries;
    const today = new Date();
    const todayIso = todayLocalIso();
    const thisYear = String(today.getFullYear());
    const twelveMonthsAgo = new Date(today);
    twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
    const twelveMonthsAgoIso = toLocalIso(twelveMonthsAgo);

    return segmentEntries.filter((e) => {
      const d = e.event.week?.startDate;
      if (!d) return false;
      if (filter === 'this-year') return d.startsWith(thisYear);
      if (filter === 'last-12m') return d >= twelveMonthsAgoIso && d <= todayIso;
      if (filter.startsWith('year:')) return d.startsWith(filter.slice(5));
      if (filter.startsWith('month:')) return d.startsWith(filter.slice(6));
      if (filter === 'range') {
        if (rangeFrom && d < rangeFrom) return false;
        if (rangeTo && d > rangeTo) return false;
        return true;
      }
      return true;
    });
  }, [segmentEntries, filter, rangeFrom, rangeTo]);

  const filterActive = filter !== 'all';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-xs text-muted-foreground">
          {filterActive
            ? `${filteredEntries.length} of ${segmentEntries.length} `
            : `${segmentEntries.length} `}
          {circuit.category} {circuit.subcategory} entr{segmentEntries.length === 1 ? 'y' : 'ies'}
        </div>
      </div>

      {segmentEntries.length > 0 && (
        <TournamentHistoryFilter
          filter={filter}
          onFilter={setFilter}
          years={filterFacets.years}
          months={filterFacets.months}
          rangeFrom={rangeFrom}
          rangeTo={rangeTo}
          onRangeFrom={setRangeFrom}
          onRangeTo={setRangeTo}
        />
      )}

      {error && <div className="text-sm text-muted-foreground">{error}</div>}
      {entries === null && !error && <div className="text-sm text-muted-foreground">Loading…</div>}
      {entries !== null && segmentEntries.length === 0 && (
        <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">
          No {circuit.category} {circuit.subcategory} tournament entries found yet.
        </div>
      )}
      {entries !== null && segmentEntries.length > 0 && filteredEntries.length === 0 && (
        <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground" data-testid="tournaments-empty-filtered">
          No tournaments match this filter. <button onClick={() => setFilter('all')} className="text-accent-ink font-semibold hover:underline">Clear filter</button>
        </div>
      )}

      {filteredEntries.map(e => (
        <div key={e.id} className="rounded-sm border border-border bg-card overflow-hidden" data-testid={`tournament-entry-${e.id}`}>
          <button
            onClick={() => setOpenId(openId === e.id ? null : e.id)}
            className="w-full flex items-center gap-3 p-3 text-left hover:bg-secondary/50"
            data-testid={`tournament-entry-toggle-${e.id}`}
          >
            <div className="text-muted-foreground shrink-0">{openId === e.id ? '▾' : '▸'}</div>
            <div className="flex-1 min-w-48">
              <div className="text-sm font-bold">{e.event.week?.name || 'Unnamed tournament'}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {formatDate(e.event.week?.startDate)} &middot; {e.event.week?.city}, {e.event.week?.stateAbbr} &middot; {e.event.week?.grade}
              </div>
            </div>
            {e.seed && <Badge variant="secondary">Seed {e.seed}</Badge>}
            <div className="text-xs text-muted-foreground shrink-0">{e.drawType === 'doubles' ? 'Doubles' : 'Singles'}</div>
          </button>
          {openId === e.id && (
            <div className="px-3 pb-3 border-t border-border">
              {isOwnDashboard && e.event.week?.source === 'aita_crowdsourced' && (
                <ResultsSheetUploader eventId={e.event.id} />
              )}
              <TournamentMatches entry={e} circuit={circuit} trackedByEventMatch={trackedByEventMatch} onOpenMatch={setModalMatch} isOwnDashboard={isOwnDashboard} />
            </div>
          )}
        </div>
      ))}

      <Link to="/tournaments" className="inline-block text-sm font-semibold text-accent-ink hover:underline">Browse the full tournament calendar &rarr;</Link>

      {modalMatch && (
        <MatchDetailModal
          match={modalMatch}
          selfName={selfName}
          onClose={() => setModalMatch(null)}
          canViewFullReport={isOwnDashboard}
        />
      )}
    </div>
  );
}


// ── Historical filter chips + date range (year / month / custom) ─────────
function monthLabel(ym) {
  // ym = 'YYYY-MM'
  const d = new Date(ym + '-01T00:00:00');
  return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}

function TournamentHistoryFilter({ filter, onFilter, years, months, rangeFrom, rangeTo, onRangeFrom, onRangeTo }) {
  const isYearFilter = filter.startsWith('year:');
  const isMonthFilter = filter.startsWith('month:');
  return (
    <div className="rounded-sm border border-border bg-card p-3 space-y-2" data-testid="tournaments-history-filter">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12px] uppercase tracking-widest font-bold text-muted-foreground shrink-0">Filter:</span>
        <FilterChip active={filter === 'all'} onClick={() => onFilter('all')} testId="filter-all">All</FilterChip>
        <FilterChip active={filter === 'this-year'} onClick={() => onFilter('this-year')} testId="filter-this-year">This year</FilterChip>
        <FilterChip active={filter === 'last-12m'} onClick={() => onFilter('last-12m')} testId="filter-last-12m">Last 12 months</FilterChip>
        <FilterChip active={filter === 'range'} onClick={() => onFilter('range')} testId="filter-range">Custom range</FilterChip>
      </div>

      {years.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] uppercase tracking-widest font-bold text-muted-foreground shrink-0">Year:</span>
          {years.map((y) => (
            <FilterChip
              key={y}
              active={filter === `year:${y}`}
              onClick={() => onFilter(`year:${y}`)}
              testId={`filter-year-${y}`}
            >
              {y}
            </FilterChip>
          ))}
        </div>
      )}

      {months.length > 0 && (isYearFilter || isMonthFilter || filter === 'all' || filter === 'this-year' || filter === 'last-12m') && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] uppercase tracking-widest font-bold text-muted-foreground shrink-0">Month:</span>
          {months.map((ym) => (
            <FilterChip
              key={ym}
              active={filter === `month:${ym}`}
              onClick={() => onFilter(`month:${ym}`)}
              testId={`filter-month-${ym}`}
            >
              {monthLabel(ym)}
            </FilterChip>
          ))}
        </div>
      )}

      {filter === 'range' && (
        <div className="flex items-center gap-2 flex-wrap pt-1" data-testid="filter-range-inputs">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            From
            <input
              type="date"
              value={rangeFrom}
              onChange={(e) => onRangeFrom(e.target.value)}
              className="rounded-sm border border-border bg-background text-foreground px-2 py-1 text-xs"
              data-testid="filter-range-from"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            To
            <input
              type="date"
              value={rangeTo}
              onChange={(e) => onRangeTo(e.target.value)}
              className="rounded-sm border border-border bg-background text-foreground px-2 py-1 text-xs"
              data-testid="filter-range-to"
            />
          </label>
          {(rangeFrom || rangeTo) && (
            <button
              onClick={() => { onRangeFrom(''); onRangeTo(''); }}
              className="text-xs text-accent-ink font-semibold hover:underline"
            >
              Clear dates
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, children, testId }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-xs font-bold transition-colors ${
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-transparent border border-border text-foreground hover:border-primary'
      }`}
      data-testid={testId}
    >
      {children}
    </button>
  );
}
