import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as api from '../api';
import { getFormat, isLegacyKnockoutPage, FORMAT_TEMPLATES } from '../utils/formats/formatRegistry';
import FormatSelector from '../components/organizer/FormatSelector';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/primitives/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/primitives/table';

function teamName(teams, id) {
  return teams.find((t) => t.id === id)?.name || 'TBD';
}

export default function FormatEventPage() {
  const { id: weekId, eventId } = useParams();
  const [week, setWeek] = useState(null);
  const [event, setEvent] = useState(null);
  const [teams, setTeams] = useState([]);
  const [stages, setStages] = useState([]);
  const [matches, setMatches] = useState([]);
  const [standings, setStandings] = useState([]);
  const [tab, setTab] = useState('overview');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [teamDraft, setTeamDraft] = useState([]);
  const [scoreDraft, setScoreDraft] = useState({});

  const formatDef = getFormat(event?.format || 'round_robin');
  const hasPlayoffs = ['rr_playoffs', 'team_tie_rr_playoffs', 'rr_page_playoff', 'pool_ko'].includes(event?.format);

  async function reload() {
    const [w, ev, tm, st, mt] = await Promise.all([
      api.getTournamentWeek(weekId),
      api.getEvent(eventId),
      api.listEventTeams(eventId).catch(() => []),
      api.listEventStages(eventId).catch(() => []),
      api.listFormatEventMatches(eventId).catch(() => []),
    ]);
    setWeek(w);
    setEvent(ev);
    setTeams(tm);
    setStages(st);
    setMatches(mt);
    if (tm.length && st.length) {
      try {
        const std = await api.computeFormatStandings(eventId, 'league');
        setStandings(std);
      } catch { setStandings([]); }
    }
    if (tm.length && !teamDraft.length) setTeamDraft(tm.map((t) => ({ name: t.name })));
  }

  useEffect(() => {
    let cancelled = false;
    reload().catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekId, eventId]);

  const leagueMatches = useMemo(() => matches.filter((m) => m.drawType === 'round_robin' || (m.stageId && stages.find((s) => s.id === m.stageId)?.stageType === 'round_robin')), [matches, stages]);
  const playoffMatches = useMemo(() => matches.filter((m) => m.drawType === 'playoffs'), [matches]);
  const leagueComplete = leagueMatches.length > 0 && leagueMatches.every((m) => m.status === 'complete');

  async function saveTeams() {
    setBusy('teams');
    setError('');
    try {
      const saved = await api.saveEventTeams(eventId, teamDraft.filter((t) => t.name.trim()));
      setTeams(saved);
      setTeamDraft(saved.map((t) => ({ name: t.name })));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  async function generateDraw() {
    setBusy('draw');
    setError('');
    try {
      if (teamDraft.some((t) => t.name.trim()) && teams.length === 0) await saveTeams();
      await api.generateFormatDraw(eventId, week?.numCourts || 4);
      await reload();
      setTab('fixtures');
    } catch (e) {
      setError(e.message.includes('event_teams') || e.message.includes('format')
        ? `${e.message} — Run supabase/phase58_multi_format.sql in Supabase SQL editor first.`
        : e.message);
    } finally {
      setBusy('');
    }
  }

  async function saveMatchScore(match) {
    const draft = scoreDraft[match.id] || {};
    const tieScore = draft.tieScore || '';
    if (!tieScore.trim()) { setError('Enter tie score (e.g. 2-1)'); return; }
    setBusy(match.id);
    setError('');
    try {
      await api.updateFormatMatchResult(match.id, { tieScore: tieScore.trim(), outcomeType: 'score' });
      await reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  async function generatePlayoffs() {
    setBusy('playoffs');
    setError('');
    try {
      await api.generateFormatPlayoffs(eventId);
      await reload();
      setTab('playoffs');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  function applyTemplateTeams(templateId) {
    const t = FORMAT_TEMPLATES[templateId];
    if (t?.defaultTeams?.length) {
      setTeamDraft(t.defaultTeams.map((name) => ({ name })));
    }
  }

  if (!event) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  if (isLegacyKnockoutPage(event.format)) {
    return (
      <div className="p-6 max-w-lg">
        <p className="text-sm">This event uses the standard knockout draw.</p>
        <Link to={`/tournaments/${weekId}/events/${eventId}`} className="text-primary underline text-sm mt-2 inline-block">
          Open knockout event →
        </Link>
      </div>
    );
  }

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'teams', label: 'Teams' },
    { id: 'fixtures', label: 'Fixtures' },
    { id: 'standings', label: 'Standings' },
    ...(hasPlayoffs ? [{ id: 'playoffs', label: 'Playoffs' }] : []),
  ];

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to={`/tournaments/${weekId}`} className="text-xs text-muted-foreground hover:text-foreground">← {week?.name || 'Tournament'}</Link>
          <h1 className="font-display font-extrabold text-xl tracking-tight mt-1">
            {event.category} {event.ageGroup}
          </h1>
          <div className="text-sm text-muted-foreground mt-0.5">{formatDef.label}</div>
        </div>
        <span className="text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-sm bg-primary/10 text-accent-ink">
          {event.status}
        </span>
      </div>

      {error && <div className="text-sm text-destructive border border-destructive/30 rounded-sm px-3 py-2">{error}</div>}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider whitespace-nowrap ${
              tab === t.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <Card>
          <CardHeader><CardTitle>Format setup</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <FormatSelector
              format={event.format}
              formatConfig={event.formatConfig || {}}
              onFormatChange={async (f, cfg) => {
                await api.updateEvent(eventId, { format: f, formatConfig: cfg });
                await reload();
              }}
              onConfigChange={async (cfg) => {
                await api.updateEvent(eventId, { formatConfig: cfg });
                await reload();
              }}
              onTemplateChange={applyTemplateTeams}
            />
            <div className="flex flex-wrap gap-2 pt-2">
              <Button disabled={!!busy} onClick={generateDraw}>
                {busy === 'draw' ? 'Generating…' : matches.length ? 'Regenerate fixtures' : 'Generate fixtures & schedule'}
              </Button>
              <Link to={`/tournaments/${weekId}/oop`}>
                <Button variant="outline">Order of Play</Button>
              </Link>
            </div>
            <p className="text-xs text-muted-foreground">
              Step 1: Add teams → Step 2: Generate fixtures → Step 3: Enter tie scores →
              {hasPlayoffs ? ' Step 4: Generate playoffs when league is complete.' : ' Done.'}
            </p>
          </CardContent>
        </Card>
      )}

      {tab === 'teams' && (
        <Card>
          <CardHeader><CardTitle>Teams / squads</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {teamDraft.map((t, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={t.name}
                  placeholder={`Team ${i + 1}`}
                  onChange={(e) => setTeamDraft((prev) => prev.map((row, j) => (j === i ? { ...row, name: e.target.value } : row)))}
                />
                <Button variant="ghost" size="icon" onClick={() => setTeamDraft((prev) => prev.filter((_, j) => j !== i))}>✕</Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setTeamDraft((prev) => [...prev, { name: '' }])}>+ Add team</Button>
              <Button size="sm" disabled={busy === 'teams'} onClick={saveTeams}>{busy === 'teams' ? 'Saving…' : 'Save teams'}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'fixtures' && (
        <Card>
          <CardHeader><CardTitle>Fixtures ({leagueMatches.length})</CardTitle></CardHeader>
          <CardContent>
            {leagueMatches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No fixtures yet — add teams and generate draw from Overview.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Match</TableHead>
                    <TableHead>Courts</TableHead>
                    <TableHead>Tie score</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leagueMatches.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">
                        {m.label || `${teamName(teams, m.team1Id)} vs ${teamName(teams, m.team2Id)}`}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {(m.courts || []).length ? `Courts ${m.courts.join(', ')}` : m.courtNumber ? `Court ${m.courtNumber}` : '—'}
                      </TableCell>
                      <TableCell>
                        {m.status === 'complete' ? (
                          <span className="font-mono text-sm">{m.tieScore || m.score || '—'}</span>
                        ) : (
                          <Input
                            className="h-8 w-24 font-mono"
                            placeholder="2-1"
                            value={scoreDraft[m.id]?.tieScore ?? ''}
                            onChange={(e) => setScoreDraft((prev) => ({ ...prev, [m.id]: { tieScore: e.target.value } }))}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        {m.status !== 'complete' && (
                          <Button size="sm" disabled={busy === m.id} onClick={() => saveMatchScore(m)}>
                            {busy === m.id ? '…' : 'Save'}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'standings' && (
        <Card>
          <CardHeader><CardTitle>Standings</CardTitle></CardHeader>
          <CardContent>
            {standings.length === 0 ? (
              <p className="text-sm text-muted-foreground">Complete fixtures to see standings.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead>W</TableHead>
                    <TableHead>L</TableHead>
                    <TableHead>Pts</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {standings.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{s.rank}</TableCell>
                      <TableCell className="font-semibold">{s.name}</TableCell>
                      <TableCell>{s.wins}</TableCell>
                      <TableCell>{s.losses}</TableCell>
                      <TableCell>{s.points}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {hasPlayoffs && leagueComplete && (
              <Button className="mt-4" disabled={!!busy} onClick={generatePlayoffs}>
                {busy === 'playoffs' ? 'Generating…' : 'Generate playoffs from standings'}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'playoffs' && (
        <Card>
          <CardHeader><CardTitle>Playoffs</CardTitle></CardHeader>
          <CardContent>
            {playoffMatches.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Complete all league fixtures, then generate playoffs from the Standings tab.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Match</TableHead>
                    <TableHead>Teams</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {playoffMatches.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>{m.label || 'Playoff'}</TableCell>
                      <TableCell>
                        {teamName(teams, m.team1Id)} vs {teamName(teams, m.team2Id)}
                      </TableCell>
                      <TableCell>
                        {m.status === 'complete' ? (m.tieScore || m.score) : (
                          <Input
                            className="h-8 w-24 font-mono"
                            placeholder="2-1"
                            value={scoreDraft[m.id]?.tieScore ?? ''}
                            onChange={(e) => setScoreDraft((prev) => ({ ...prev, [m.id]: { tieScore: e.target.value } }))}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        {m.status !== 'complete' && m.team1Id && m.team2Id && (
                          <Button size="sm" disabled={busy === m.id} onClick={() => saveMatchScore(m)}>Save</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
