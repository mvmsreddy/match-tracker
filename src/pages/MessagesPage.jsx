import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import * as api from '../api';
import { Card } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : parts[0].slice(0, 2).toUpperCase();
}

function timeLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString();
}

// Messaging (Phase 3, item 8) — one thread per player, shared by every
// coach/parent linked to them (see supabase/phase40_messaging.sql). Player
// role sees just their own thread; coach/parent sees one per roster player.
export default function MessagesPage() {
  const { user } = useAuth();
  const [threads, setThreads] = useState(null);
  const [activePlayerId, setActivePlayerId] = useState(null);
  const [messages, setMessages] = useState(null);
  const [threadId, setThreadId] = useState(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    api.getMyThreads(user.id, user.role)
      .then(data => {
        if (cancelled) return;
        setThreads(data);
        if (data.length > 0 && !activePlayerId) setActivePlayerId(data[0].playerId);
      })
      .catch(e => { if (!cancelled) { setError(e.message || 'Could not load conversations'); setThreads([]); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, user.role]);

  useEffect(() => {
    if (!activePlayerId) return;
    let cancelled = false;
    api.getThreadMessages(activePlayerId)
      .then(({ threadId: tid, messages: msgs }) => {
        if (cancelled) return;
        setThreadId(tid);
        setMessages(msgs);
      })
      .catch(e => { if (!cancelled) setError(e.message || 'Could not load messages'); });
    return () => { cancelled = true; };
  }, [activePlayerId]);

  useEffect(() => {
    if (!threadId || !supabase) return;
    const channel = supabase
      .channel(`messages:${threadId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `thread_id=eq.${threadId}` },
        () => { api.getThreadMessages(activePlayerId).then(({ messages: msgs }) => setMessages(msgs)).catch(() => {}); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [threadId, activePlayerId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    const body = draft.trim();
    if (!body || !activePlayerId) return;
    setSending(true);
    setError('');
    try {
      const sent = await api.sendMessage(activePlayerId, user.id, body);
      setMessages(prev => [...(prev || []), sent]);
      setDraft('');
    } catch (e) {
      setError(e.message || 'Could not send message');
    } finally {
      setSending(false);
    }
  }

  if (threads === null) return <div className="px-4 lg:px-8 py-6 text-sm text-muted-foreground">Loading conversations…</div>;
  if (threads.length === 0) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-3xl mx-auto">
        <h1 className="font-display font-extrabold text-2xl tracking-tighter mb-4">Messages</h1>
        <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">
          {user.role === 'player' ? 'No coaches or parents linked yet.' : 'No players linked yet.'}
        </div>
      </div>
    );
  }

  const activeThread = threads.find(t => t.playerId === activePlayerId);

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-6xl mx-auto">
      <h1 className="font-display font-extrabold text-2xl tracking-tighter mb-4">Messages</h1>
      {error && <div className="text-destructive text-sm mb-3">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
        <Card className="p-2 h-fit md:sticky md:top-20">
          {threads.map(t => (
            <button
              key={t.playerId}
              onClick={() => setActivePlayerId(t.playerId)}
              className={`w-full flex items-center gap-3 p-3 rounded-sm text-left ${t.playerId === activePlayerId ? 'bg-secondary' : 'hover:bg-secondary/50'}`}
            >
              <span className="w-9 h-9 rounded-sm bg-secondary flex items-center justify-center text-xs font-bold shrink-0">
                {initials(t.player?.displayName)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate">
                  {t.isSelf ? 'You' : (t.player?.displayName || '—')}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {t.lastMessage?.body || 'No messages yet'}
                </div>
              </div>
            </button>
          ))}
        </Card>

        <Card className="p-0 flex flex-col h-[60vh]">
          <div className="p-3 border-b border-border font-semibold text-sm">
            {activeThread?.isSelf ? 'You' : (activeThread?.player?.displayName || '—')}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages === null && <div className="text-sm text-muted-foreground">Loading…</div>}
            {messages !== null && messages.length === 0 && <div className="text-sm text-muted-foreground">No messages yet — say hello.</div>}
            {messages !== null && messages.map(m => {
              const isMine = m.senderId === user.id;
              return (
                <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-sm px-3 py-2 ${isMine ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>
                    {!isMine && (
                      <div className="text-[12px] font-bold uppercase tracking-wider opacity-70 mb-0.5">
                        {m.sender?.displayName || 'Unknown'}{m.sender?.role ? ` · ${m.sender.role}` : ''}
                      </div>
                    )}
                    <div className="text-sm whitespace-pre-wrap">{m.body}</div>
                    <div className="text-[12px] opacity-60 mt-1 text-right">{timeLabel(m.createdAt)}</div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          <div className="p-3 border-t border-border flex gap-2">
            <textarea
              className="flex-1 rounded-sm border border-input bg-transparent px-3 py-2 text-sm resize-none h-10"
              placeholder="Type a message…"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              maxLength={2000}
            />
            <Button onClick={handleSend} disabled={sending || !draft.trim()}>Send</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
