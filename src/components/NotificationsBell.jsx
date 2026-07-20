import { useState } from 'react';
import { useNotifications } from '../hooks/useNotifications';

export default function NotificationsBell() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <button
        className="top-nav-avatar"
        style={{ position: 'relative', fontSize: '1rem' }}
        onClick={() => setOpen(v => !v)}
        aria-label="Notifications"
        title="Notifications"
      >
        🔔
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16,
              borderRadius: 8, background: '#e05252', color: '#fff',
              fontSize: 10, lineHeight: '16px', textAlign: 'center', padding: '0 3px',
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div
            style={{
              position: 'absolute', right: 0, top: '110%', zIndex: 41,
              width: 320, maxHeight: 400, overflowY: 'auto',
              background: 'var(--bg2,#1a1a1a)', border: '1px solid var(--border,#333)',
              borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border,#333)' }}>
              <span style={{ fontFamily: 'Oswald, sans-serif', fontSize: '0.85rem', color: 'var(--text,#eee)' }}>Notifications</span>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  style={{ background: 'none', border: 'none', color: 'var(--accent,#1a6b3a)', cursor: 'pointer', fontSize: '0.72rem' }}
                >
                  Mark all read
                </button>
              )}
            </div>
            {notifications.length === 0 ? (
              <div style={{ padding: 16, fontSize: '0.75rem', color: 'var(--text2,#888)', textAlign: 'center' }}>
                No notifications yet.
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => !n.isRead && markRead(n.id)}
                  style={{
                    padding: '8px 12px', borderBottom: '1px solid var(--border,#2a2a2a)',
                    background: n.isRead ? 'transparent' : 'rgba(26,107,58,0.12)',
                    cursor: n.isRead ? 'default' : 'pointer',
                  }}
                >
                  <div style={{ fontSize: '0.78rem', color: 'var(--text,#eee)', fontWeight: n.isRead ? 400 : 600 }}>{n.title}</div>
                  {n.body && <div style={{ fontSize: '0.72rem', color: 'var(--text2,#888)', marginTop: 2 }}>{n.body}</div>}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
