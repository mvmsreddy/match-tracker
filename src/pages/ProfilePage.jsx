import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import TopNav from '../components/TopNav';

const STATES = [
  'AP','AR','AS','BR','CG','GA','GJ','HR','HP','JH','KA','KL',
  'MP','MH','MN','ML','MZ','NL','OD','PB','RJ','SK','TN','TS',
  'TR','UP','UK','WB','AN','CH','DN','DD','DL','JK','LA','LD','PY',
];

const ROLE_LABELS = {
  player:    'Player',
  coach:     'Coach',
  organizer: 'Tournament Organizer',
};

export default function ProfilePage() {
  const { user, refreshProfile } = useAuth();

  const [form, setForm] = useState({
    displayName: user.displayName || user.name || '',
    role:        user.role || 'player',
    aitaReg:     user.aitaReg || '',
    stateAbbr:   user.stateAbbr || '',
    dateOfBirth: user.dateOfBirth || '',
    gender:      user.gender || '',
    ranking:     user.ranking || '',
    clubName:    user.clubName || '',
    bio:         user.bio || '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  function handleChange(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
    setSaved(false);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.displayName.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      await api.upsertProfile(user.id, {
        ...form,
        ranking: form.ranking ? Number(form.ranking) : null,
      });
      await refreshProfile();
      setSaved(true);
    } catch (err) {
      setError(err.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  }

  const isPlayer    = form.role === 'player';
  const isCoach     = form.role === 'coach';
  const isOrganizer = form.role === 'organizer';

  // Profile completeness for players
  const missingPlayerFields = isPlayer
    ? [
        !form.aitaReg && 'AITA Registration No.',
        !form.dateOfBirth && 'Date of Birth',
        !form.gender && 'Gender',
        !form.stateAbbr && 'State',
      ].filter(Boolean)
    : [];

  return (
    <div className="root">
      <TopNav />

      <div className="header">
        <div className="title-row">
          <div>
            <h1 className="title">My Profile</h1>
            <div className="subtitle">
              {ROLE_LABELS[user.role] || 'Player'}
              {user.isVerified && ' · Verified'}
              {' · '}{user.email}
            </div>
          </div>
          <span className={`role-badge role-badge-${user.role}`}>
            {ROLE_LABELS[user.role] || user.role}
          </span>
        </div>
      </div>

      <div className="page-scroll">
        {missingPlayerFields.length > 0 && (
          <div style={{
            background: '#7c3a00', color: '#ffd9b0',
            borderRadius: 8, padding: '10px 14px',
            margin: '0 16px 12px', fontSize: 13,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 18 }}>⚠</span>
            <span>
              Complete your profile to enter tournaments.
              Missing: <strong>{missingPlayerFields.join(', ')}</strong>.
            </span>
          </div>
        )}
        <form onSubmit={handleSave} className="profile-form">

          {/* Basic Info */}
          <div className="profile-section">
            <div className="profile-section-label">Basic Info</div>
            <div className="t-form-row">
              <div className="field">
                <label>Display Name *</label>
                <input
                  value={form.displayName}
                  onChange={e => handleChange('displayName', e.target.value)}
                  placeholder="Your full name"
                />
              </div>
              <div className="field">
                <label>Role</label>
                <div className="profile-role-row">
                  {['player', 'coach', 'organizer'].map(r => (
                    <button
                      key={r}
                      type="button"
                      className={'profile-role-btn' + (form.role === r ? ' active' : '')}
                      onClick={() => handleChange('role', r)}
                    >
                      {ROLE_LABELS[r]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Player Fields */}
          {(isPlayer || isCoach) && (
            <div className="profile-section">
              <div className="profile-section-label">
                {isPlayer ? 'Player Details' : 'Coaching Details'}
              </div>
              {isPlayer && (
                <div className="t-form-row">
                  <div className="field">
                    <label>AITA Registration No.</label>
                    <input
                      value={form.aitaReg}
                      onChange={e => handleChange('aitaReg', e.target.value)}
                      placeholder="e.g. 442320"
                    />
                  </div>
                  <div className="field">
                    <label>Current AITA Ranking</label>
                    <input
                      type="number"
                      value={form.ranking}
                      onChange={e => handleChange('ranking', e.target.value)}
                      placeholder="e.g. 17"
                      min="1"
                    />
                  </div>
                </div>
              )}
              <div className="t-form-row">
                <div className="field">
                  <label>State</label>
                  <select value={form.stateAbbr} onChange={e => handleChange('stateAbbr', e.target.value)}>
                    <option value="">Select state…</option>
                    {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                {isPlayer && (
                  <div className="field">
                    <label>Date of Birth</label>
                    <input
                      type="date"
                      value={form.dateOfBirth}
                      onChange={e => handleChange('dateOfBirth', e.target.value)}
                    />
                  </div>
                )}
                {isPlayer && (
                  <div className="field">
                    <label>Gender</label>
                    <select value={form.gender} onChange={e => handleChange('gender', e.target.value)}>
                      <option value="">Select…</option>
                      <option value="M">Male</option>
                      <option value="F">Female</option>
                    </select>
                  </div>
                )}
                {isCoach && (
                  <div className="field">
                    <label>Club / Academy</label>
                    <input
                      value={form.clubName}
                      onChange={e => handleChange('clubName', e.target.value)}
                      placeholder="Club or academy name"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Organizer Fields */}
          {isOrganizer && (
            <div className="profile-section">
              <div className="profile-section-label">Organizer Details</div>
              <div className="t-form-row">
                <div className="field">
                  <label>Club / Organisation Name</label>
                  <input
                    value={form.clubName}
                    onChange={e => handleChange('clubName', e.target.value)}
                    placeholder="e.g. SLTA Academy"
                  />
                </div>
                <div className="field">
                  <label>State</label>
                  <select value={form.stateAbbr} onChange={e => handleChange('stateAbbr', e.target.value)}>
                    <option value="">Select state…</option>
                    {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              {user.isVerified && (
                <div className="profile-verified-badge">
                  Verified Organizer
                </div>
              )}
            </div>
          )}

          {/* Bio */}
          <div className="profile-section">
            <div className="profile-section-label">Bio</div>
            <div className="field">
              <textarea
                className="profile-bio"
                value={form.bio}
                onChange={e => handleChange('bio', e.target.value)}
                placeholder="A short bio (optional)"
                rows={3}
              />
            </div>
          </div>

          {error && <div className="login-error" style={{ maxWidth: 680, margin: '0 auto', padding: '0 16px' }}>{error}</div>}

          <div className="profile-actions">
            <button type="submit" className="action-btn primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save Profile'}
            </button>
            {saved && <span className="status-msg">Saved!</span>}
          </div>

        </form>
      </div>
    </div>
  );
}
