import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useTheme, PRE_DAWN, PRE_DUSK } from '@/context/ThemeContext';
import { getInitials } from '@/lib/initials';
import { getNavItems, getPrimaryNavItems } from '@/lib/navItems';
import { downloadAppGuide } from '@/lib/appGuidePdf';
import NotificationsBell from '@/components/NotificationsBell';
import {
  Trophy, Menu, X, MoreHorizontal, User, LogOut, FileDown,
  Sun, Moon, SunMoon, Contrast,
} from 'lucide-react';

const TIER_OPTIONS = [
  { value: 'auto', label: 'Auto', icon: SunMoon },
  { value: 'day', label: 'Day', icon: Sun },
  { value: 'night', label: 'Night', icon: Moon },
];

function formatClock(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

// Only meaningful while today's cached sun times still describe a threshold
// in the future — getSunTimes() only caches *today*, so once we're past
// tonight's dusk margin there's no "next switch" time to show until the
// cache rolls over tomorrow. Omitting the line then is more honest than
// showing a stale or negative countdown.
function nextSwitchLabel(tier, sun) {
  if (!sun) return null;
  const now = Date.now();
  if (tier === 'day') {
    const to = sun.sunset - PRE_DUSK * 60000;
    if (to <= now) return null;
    return `Sunset ${formatClock(sun.sunset)} · switching to night in ${Math.round((to - now) / 60000)} min`;
  }
  const from = sun.sunrise + PRE_DAWN * 60000;
  if (from <= now) return null;
  return `Sunrise ${formatClock(sun.sunrise)} · switching to day in ${Math.round((from - now) / 60000)} min`;
}

function AppearanceControl({ compact }) {
  const { preference, setPreference, tier, sun } = useTheme();
  const switchLabel = !compact ? nextSwitchLabel(tier, sun) : null;

  return (
    <div className={compact ? 'flex items-center gap-2' : 'space-y-2'}>
      {!compact && (
        <div className="text-[11.5px] font-bold uppercase tracking-wide text-muted-foreground">Appearance</div>
      )}
      <div className="flex items-center gap-1.5">
        <div className="inline-flex items-center gap-0.5 rounded-full bg-muted p-1" role="group" aria-label="Theme">
          {TIER_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setPreference(value)}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-bold transition-colors ${
                preference === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-pressed={preference === value}
              data-testid={`tier-option-${value}`}
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={2.5} />
              {!compact && <span>{label}</span>}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setPreference(preference === 'glare' ? 'auto' : 'glare')}
          className={`flex items-center justify-center rounded-full p-1.5 border transition-colors ${
            preference === 'glare' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'
          }`}
          aria-pressed={preference === 'glare'}
          aria-label="Glare mode (high contrast, manual only)"
          title="Glare — high contrast for bright sun"
          data-testid="tier-option-glare"
        >
          <Contrast className="w-3.5 h-3.5" strokeWidth={2.5} />
        </button>
      </div>
      {switchLabel && (
        <div className="text-[12.5px] text-muted-foreground" data-testid="tier-switch-label">{switchLabel}</div>
      )}
    </div>
  );
}

function UserMenu({ displayName, email, initials, onNavigate, onLogout }) {
  return (
    <div className="w-64 rounded-lg border border-border bg-popover text-popover-foreground p-2 shadow-xl" data-testid="user-menu-dropdown">
      <div className="px-3 py-2.5 flex items-center gap-3 border-b border-border">
        <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">
          {initials}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold truncate">{displayName}</div>
          <div className="text-xs text-muted-foreground truncate">{email}</div>
        </div>
      </div>
      <NavLink
        to="/profile"
        onClick={onNavigate}
        className="mt-1 flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-secondary transition-colors"
        data-testid="menu-profile-link"
      >
        <User className="w-4 h-4" />
        Edit Profile
      </NavLink>
      <button
        onClick={onLogout}
        className="w-full mt-0.5 text-left px-3 py-2 rounded-md text-sm bg-transparent hover:bg-destructive/10 hover:text-destructive transition-colors flex items-center gap-2"
        data-testid="menu-logout-btn"
      >
        <LogOut className="w-4 h-4" /> Log out
      </button>
    </div>
  );
}

function MoreSheet({ open, onClose, items, role, onLogout }) {
  useEffect(() => {
    if (!open) return;
    function handleKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
        onClick={onClose}
        data-testid="more-sheet-overlay"
      />
      <div
        className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-[26px] border-t border-border bg-card text-card-foreground p-4 pb-[calc(16px+env(safe-area-inset-bottom,0px))] shadow-2xl md:hidden"
        data-testid="more-sheet"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
        <div className="flex items-center justify-between mb-3">
          <span className="text-[15px] font-extrabold">More</span>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-secondary transition-colors"
            aria-label="Close"
            data-testid="more-sheet-close-btn"
          >
            <X className="w-5 h-5" strokeWidth={2} />
          </button>
        </div>

        <nav className="grid grid-cols-2 gap-2 mb-4" onClick={onClose}>
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.id}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-[18px] px-3 py-3 text-sm font-bold transition-colors ${
                    isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-secondary'
                  }`
                }
                data-testid={`more-nav-item-${item.id}`}
              >
                <Icon className="w-[19px] h-[19px] shrink-0" strokeWidth={2.25} />
                <span className="truncate">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="rounded-2xl border border-border p-3 mb-3">
          <AppearanceControl compact={false} />
        </div>

        <div className="space-y-1">
          <button
            onClick={downloadAppGuide}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-semibold bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            data-testid="drawer-download-guide"
          >
            <FileDown className="w-4 h-4" strokeWidth={2.5} />
            Download Guide PDF
          </button>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-semibold bg-transparent text-destructive hover:bg-destructive/10 transition-colors"
            data-testid="drawer-logout-btn"
          >
            <LogOut className="w-4 h-4" strokeWidth={2.5} />
            Log out
          </button>
        </div>
      </div>
    </>
  );
}

// Single nav shell for the whole app, presented three ways off one
// getNavItems(role) source of truth: a floating bottom bar + More sheet
// below 768px, a 72px icon-only rail 768-1023px, and a 226px labelled rail
// at 1024px+. Replaces AppShell + NavDrawer + MTNavChrome/TopNav, which each
// rendered navigation independently and could disagree on what was in it.
// Open/close state for a dropdown that dismisses on outside-click and
// Escape. Used twice below (phone/tablet header avatar, laptop rail user
// card) — those two triggers are both present in the DOM at once (CSS, not
// JS, decides which is visible per breakpoint), so they need independent
// state or opening one would also mount the other's dropdown.
function useDismissable() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function handleKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);
  return [open, setOpen, ref];
}

export default function AppNav({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const role = user?.role || 'player';
  const displayName = user?.displayName || user?.name || '?';
  const initials = getInitials(displayName);

  const items = getNavItems(role);
  const primaryItems = getPrimaryNavItems(role);
  const activeItem = items.find((i) => (i.end ? location.pathname === i.to : location.pathname.startsWith(i.to)));
  const pageTitle = activeItem ? activeItem.label : 'Match Tracker';

  const [moreOpen, setMoreOpen] = useState(false);
  const [headerUserMenuOpen, setHeaderUserMenuOpen, headerUserMenuRef] = useDismissable();
  const [railUserMenuOpen, setRailUserMenuOpen, railUserMenuRef] = useDismissable();

  // Close the sheet/dropdowns on navigation so they don't stay open across route changes.
  useEffect(() => {
    setMoreOpen(false);
    setHeaderUserMenuOpen(false);
    setRailUserMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Tablet icon rail (768-1023) */}
      <nav
        className="hidden md:flex lg:hidden fixed inset-y-0 left-0 z-40 w-[72px] flex-col items-center gap-1.5 border-r border-border bg-secondary py-4 overflow-y-auto"
        data-testid="app-nav-tablet-rail"
      >
        <div className="w-9 h-9 bg-accent flex items-center justify-center rounded-[10px] mb-3 shrink-0">
          <Trophy className="w-[18px] h-[18px] text-accent-foreground" strokeWidth={2.5} />
        </div>
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.id}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center justify-center w-11 h-11 rounded-2xl transition-colors ${
                  isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`
              }
              title={item.label}
              data-testid={`rail-nav-item-${item.id}`}
            >
              <Icon className="w-5 h-5" strokeWidth={2.25} />
            </NavLink>
          );
        })}
      </nav>

      {/* Laptop labelled rail (>=1024) */}
      <nav
        className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-[226px] flex-col gap-1 border-r border-border bg-secondary p-3 overflow-y-auto"
        data-testid="app-nav-laptop-rail"
      >
        <div className="flex items-center gap-2.5 px-2 pb-[18px] pt-1">
          <div className="w-[34px] h-[34px] bg-accent flex items-center justify-center rounded-xl shrink-0">
            <Trophy className="w-4 h-4 text-accent-foreground" strokeWidth={2.5} />
          </div>
          <span className="font-display font-extrabold text-[14.5px] tracking-tight truncate">Match Tracker</span>
        </div>
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.id}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-[11px] px-[9px] py-[11px] rounded-2xl text-sm font-semibold transition-colors ${
                  isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`
              }
              data-testid={`rail-nav-item-${item.id}`}
            >
              <Icon className="w-4 h-4 shrink-0" strokeWidth={2.25} />
              <span className="truncate">{item.label}</span>
            </NavLink>
          );
        })}
        <div className="mt-auto relative" ref={railUserMenuRef}>
          <button
            onClick={() => setRailUserMenuOpen((v) => !v)}
            className="w-full flex items-center gap-2.5 p-2.5 rounded-[11px] bg-card border border-border hover:border-primary/40 transition-colors"
            data-testid="rail-user-btn"
          >
            <div className="w-[30px] h-[30px] rounded-lg bg-muted flex items-center justify-center text-primary text-xs font-bold shrink-0">
              {initials}
            </div>
            <div className="min-w-0 text-left">
              <div className="text-[12.5px] font-semibold truncate">{displayName}</div>
              <div className="text-[12px] uppercase tracking-wider text-muted-foreground truncate">{role}</div>
            </div>
          </button>
          {railUserMenuOpen && (
            <div className="absolute bottom-full left-0 mb-2 z-50">
              <UserMenu displayName={displayName} email={user?.email} initials={initials} onNavigate={() => setRailUserMenuOpen(false)} onLogout={logout} />
            </div>
          )}
        </div>
      </nav>

      <div className="md:pl-[72px] lg:pl-[226px] flex flex-col min-h-screen">
        {/* Header: phone/tablet brand row below 1024px, laptop topbar at/above it */}
        <header
          className="sticky top-0 z-30 bg-background border-b border-border px-3 sm:px-4 lg:px-8 py-2.5 flex items-center justify-between gap-2"
          data-testid="app-nav-header"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1 lg:hidden">
            <button
              className="flex items-center justify-center w-10 h-10 rounded-lg bg-transparent hover:bg-secondary transition-colors shrink-0 text-foreground md:hidden"
              onClick={() => setMoreOpen(true)}
              aria-label="Open menu"
              data-testid="menu-toggle-btn"
            >
              <Menu className="w-5 h-5" strokeWidth={2} />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 bg-accent flex items-center justify-center rounded-lg shrink-0 md:hidden">
                <Trophy className="w-4 h-4 text-accent-foreground" strokeWidth={2.5} />
              </div>
              <div className="min-w-0">
                <div className="font-display font-extrabold text-sm sm:text-base tracking-tighter leading-none truncate">{pageTitle}</div>
                <div className="text-[11.5px] uppercase tracking-[0.15em] font-bold text-muted-foreground mt-0.5 leading-none">
                  {role}
                </div>
              </div>
            </div>
          </div>

          <div className="hidden lg:block min-w-0 flex-1">
            <div className="font-display font-extrabold text-[20px] tracking-tight truncate">{pageTitle}</div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <div className="hidden lg:block">
              <AppearanceControl compact />
            </div>
            <NotificationsBell />
            <div className="relative lg:hidden" ref={headerUserMenuRef}>
              <button
                onClick={() => setHeaderUserMenuOpen((v) => !v)}
                className="w-10 h-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold hover:shadow-md transition-shadow"
                aria-label="User menu"
                data-testid="user-menu-btn"
              >
                {initials}
              </button>
              {headerUserMenuOpen && (
                <div className="fixed sm:absolute right-2 left-auto sm:left-auto sm:right-0 top-16 sm:top-12 z-50">
                  <UserMenu displayName={displayName} email={user?.email} initials={initials} onNavigate={() => setHeaderUserMenuOpen(false)} onLogout={logout} />
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 pb-[92px] md:pb-8" data-testid="app-nav-content">
          {children}
        </main>
      </div>

      {/* Phone bottom bar (<768) */}
      <nav
        className="md:hidden fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 gap-1.5 rounded-t-[26px] bg-[#101914] p-2 pb-[calc(8px+env(safe-area-inset-bottom,0px))] shadow-2xl"
        data-testid="app-nav-bottom-bar"
      >
        {primaryItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.id}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 rounded-[18px] py-1.5 text-[10.5px] font-bold transition-colors ${
                  isActive ? 'bg-primary text-primary-foreground' : 'text-white/65'
                }`
              }
              data-testid={`bottom-bar-item-${item.id}`}
            >
              <Icon className="w-[18px] h-[18px]" strokeWidth={2.25} />
              <span className="truncate max-w-full px-0.5">{item.label}</span>
            </NavLink>
          );
        })}
        <button
          onClick={() => setMoreOpen(true)}
          className="flex flex-col items-center justify-center gap-0.5 rounded-[18px] py-1.5 text-[10.5px] font-bold text-white/65"
          aria-label="More"
          data-testid="bottom-bar-more"
        >
          <MoreHorizontal className="w-[18px] h-[18px]" strokeWidth={2.25} />
          <span>More</span>
        </button>
      </nav>

      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} items={items} role={role} onLogout={logout} />
    </div>
  );
}
