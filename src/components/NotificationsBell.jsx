import { useState } from 'react';
import { Bell } from 'lucide-react';
import { useNotifications } from '../hooks/useNotifications';

export default function NotificationsBell() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-transparent hover:bg-secondary transition-colors"
        onClick={() => setOpen(v => !v)}
        aria-label="Notifications"
        title="Notifications"
        data-testid="notifications-bell"
      >
        <Bell className="w-4 h-4 text-foreground" strokeWidth={2} />
        {unreadCount > 0 && (
          <span
            className="absolute top-1 right-1 min-w-[16px] h-4 rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center px-1 border-2 border-background"
            data-testid="notifications-badge"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-11 z-50 w-80 max-h-96 overflow-y-auto rounded-lg border border-border bg-popover text-popover-foreground shadow-xl"
            data-testid="notifications-dropdown"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-popover">
              <span className="font-display font-bold text-sm tracking-tight">Notifications</span>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-primary hover:underline font-semibold"
                >
                  Mark all read
                </button>
              )}
            </div>
            {notifications.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-50" />
                <div className="text-sm text-muted-foreground">No notifications yet</div>
              </div>
            ) : (
              <div>
                {notifications.map(n => (
                  <div
                    key={n.id}
                    onClick={() => !n.isRead && markRead(n.id)}
                    className={`px-4 py-3 border-b border-border last:border-b-0 transition-colors ${
                      n.isRead 
                        ? 'cursor-default hover:bg-muted/30' 
                        : 'cursor-pointer bg-primary/5 hover:bg-primary/10 border-l-4 border-l-primary'
                    }`}
                  >
                    <div className={`text-sm ${n.isRead ? 'text-muted-foreground' : 'font-semibold text-foreground'}`}>
                      {n.title}
                    </div>
                    {n.body && (
                      <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        {n.body}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
