import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';

const ROLES = [
  {
    id: 'player',
    label: 'Player',
    desc: 'I compete in tournaments and want to track my matches and results.',
    detail: 'Access: Match tracker · Tournament draws · My schedule',
  },
  {
    id: 'coach',
    label: 'Coach',
    desc: 'I train players and want to monitor their performance and tournament schedule.',
    detail: 'Access: Player stats · Tournament watch · Match tracker',
  },
  {
    id: 'organizer',
    label: 'Tournament Organizer',
    desc: 'I host AITA events and need to manage draws, scores, and order of play.',
    detail: 'Access: Create events · Draw management · Order of play · PDFs',
  },
];

export default function RoleSetupOverlay() {
  const { user, refreshProfile } = useAuth();
  const [selected, setSelected] = useState('');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  async function handleConfirm() {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      await api.upsertProfile(user.id, {
        role: selected,
        displayName: user.displayName || user.name,
      });
      await refreshProfile();
      // refreshProfile updates user.roleConfirmed → overlay unmounts automatically
    } catch (err) {
      setError(err.message || 'Could not save. Please try again.');
      setSaving(false);
    }
  }

  return (
    <div className="role-overlay">
      <div className="role-overlay-card">
        <div className="role-overlay-logo">Tennis Tracker</div>

        <h1 className="role-overlay-title">Welcome, {(user.displayName || user.name || '').split(' ')[0]}!</h1>
        <p className="role-overlay-sub">
          You signed in with Google. Tell us who you are so we can set up the right experience for you.
        </p>

        <div className="role-overlay-grid">
          {ROLES.map(r => (
            <button
              key={r.id}
              className={'role-overlay-card-btn' + (selected === r.id ? ' selected' : '')}
              onClick={() => setSelected(r.id)}
              type="button"
            >
              <div className="role-overlay-card-label">{r.label}</div>
              <div className="role-overlay-card-desc">{r.desc}</div>
              <div className="role-overlay-card-detail">{r.detail}</div>
            </button>
          ))}
        </div>

        {error && <div className="login-error" style={{ marginTop: 12 }}>{error}</div>}

        <button
          className="role-overlay-confirm"
          disabled={!selected || saving}
          onClick={handleConfirm}
        >
          {saving ? 'Setting up your account…' : selected ? `Continue as ${ROLES.find(r => r.id === selected)?.label}` : 'Select your role to continue'}
        </button>

        <p className="role-overlay-note">
          You can change this later from your profile settings.
        </p>
      </div>
    </div>
  );
}
