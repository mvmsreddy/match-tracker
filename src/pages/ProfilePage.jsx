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

const GENDER_LABELS   = { M: 'Male', F: 'Female' };
const PLAYS_LABELS    = { R: 'Right-handed', L: 'Left-handed' };
const BACKHAND_LABELS = { '1H': 'One-handed', '2H': 'Two-handed' };

function getInitials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

function getAge(dob) {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const beforeBirthday = today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());
  if (beforeBirthday) age--;
  return age;
}

function Row({ label, value }) {
  return (
    <div className="profile-row">
      <span className="profile-row-label">{label}</span>
      <span className="profile-row-value">{value || value === 0 ? value : '—'}</span>
    </div>
  );
}

export default function ProfilePage() {
  const { user, refreshProfile } = useAuth();

  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState('bio');

  const [form, setForm] = useState({
    displayName:   user.displayName || user.name || '',
    role:          user.role || 'player',
    aitaReg:       user.aitaReg || '',
    stateAbbr:     user.stateAbbr || '',
    dateOfBirth:   user.dateOfBirth || '',
    gender:        user.gender || '',
    ranking:       user.ranking || '',
    clubName:      user.clubName || '',
    bio:           user.bio || '',

    phone:         user.phone || '',
    homeCourt:     user.homeCourt || '',
    nationality:   user.nationality || '',
    country:       user.country || '',
    city:          user.city || '',
    region:        user.region || '',
    postalCode:    user.postalCode || '',
    height:        user.height || '',
    plays:         user.plays || '',
    backhand:      user.backhand || '',

    racquetBrand:  user.racquetBrand || '',
    racquetName:   user.racquetName || '',
    racquetYear:   user.racquetYear || '',
    stringBrand:   user.stringBrand || '',
    stringName:    user.stringName || '',
    stringTension: user.stringTension || '',
    shoeBrand:     user.shoeBrand || '',
    shoeName:      user.shoeName || '',
    bagBrand:      user.bagBrand || '',
    bagName:       user.bagName || '',
    gripBrand:     user.gripBrand || '',
    gripName:      user.gripName || '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  function handleChange(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
    setSaved(false);
  }

  function handleCancel() {
    setForm({
      displayName:   user.displayName || user.name || '',
      role:          user.role || 'player',
      aitaReg:       user.aitaReg || '',
      stateAbbr:     user.stateAbbr || '',
      dateOfBirth:   user.dateOfBirth || '',
      gender:        user.gender || '',
      ranking:       user.ranking || '',
      clubName:      user.clubName || '',
      bio:           user.bio || '',
      phone:         user.phone || '',
      homeCourt:     user.homeCourt || '',
      nationality:   user.nationality || '',
      country:       user.country || '',
      city:          user.city || '',
      region:        user.region || '',
      postalCode:    user.postalCode || '',
      height:        user.height || '',
      plays:         user.plays || '',
      backhand:      user.backhand || '',
      racquetBrand:  user.racquetBrand || '',
      racquetName:   user.racquetName || '',
      racquetYear:   user.racquetYear || '',
      stringBrand:   user.stringBrand || '',
      stringName:    user.stringName || '',
      stringTension: user.stringTension || '',
      shoeBrand:     user.shoeBrand || '',
      shoeName:      user.shoeName || '',
      bagBrand:      user.bagBrand || '',
      bagName:       user.bagName || '',
      gripBrand:     user.gripBrand || '',
      gripName:      user.gripName || '',
    });
    setError('');
    setEditing(false);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.displayName.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      await api.upsertProfile(user.id, {
        ...form,
        ranking:     form.ranking ? Number(form.ranking) : null,
        racquetYear: form.racquetYear ? Number(form.racquetYear) : null,
      });
      await refreshProfile();
      setSaved(true);
      setEditing(false);
    } catch (err) {
      setError(err.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  }

  const isPlayer    = form.role === 'player';
  const isCoach     = form.role === 'coach';
  const isOrganizer = form.role === 'organizer';
  const age = getAge(form.dateOfBirth);

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

      <div className="page-scroll">
        <div className="profile-card">
          <div className="profile-avatar-lg">{getInitials(form.displayName)}</div>
          <div className="profile-card-info">
            <h1 className="profile-name">{form.displayName || 'Unnamed Player'}</h1>
            <div className="profile-meta-row">
              <span className={`role-badge role-badge-${form.role}`}>
                {ROLE_LABELS[form.role] || form.role}
              </span>
              {user.isVerified && <span className="profile-verified-chip">✓ Verified</span>}
            </div>
          </div>
          <button
            type="button"
            className="action-btn profile-edit-btn"
            onClick={() => editing ? handleCancel() : setEditing(true)}
          >
            {editing ? 'Cancel' : '✎ Edit'}
          </button>
        </div>

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

        {!editing && (
          <div className="profile-tabs">
            <button
              type="button"
              className={'profile-tab-btn' + (tab === 'bio' ? ' active' : '')}
              onClick={() => setTab('bio')}
            >
              Bio
            </button>
            <button
              type="button"
              className={'profile-tab-btn' + (tab === 'ratings' ? ' active' : '')}
              onClick={() => setTab('ratings')}
            >
              Ratings
            </button>
          </div>
        )}

        {editing ? (
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

            {/* Contact & Location */}
            <div className="profile-section">
              <div className="profile-section-label">Contact & Location</div>
              <div className="t-form-row">
                <div className="field">
                  <label>Phone</label>
                  <input
                    value={form.phone}
                    onChange={e => handleChange('phone', e.target.value)}
                    placeholder="Phone number"
                  />
                </div>
                <div className="field">
                  <label>Home Court</label>
                  <input
                    value={form.homeCourt}
                    onChange={e => handleChange('homeCourt', e.target.value)}
                    placeholder="e.g. SLTA Academy Courts"
                  />
                </div>
              </div>
              <div className="t-form-row">
                <div className="field">
                  <label>Nationality</label>
                  <input
                    value={form.nationality}
                    onChange={e => handleChange('nationality', e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Country</label>
                  <input
                    value={form.country}
                    onChange={e => handleChange('country', e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>City</label>
                  <input
                    value={form.city}
                    onChange={e => handleChange('city', e.target.value)}
                  />
                </div>
              </div>
              <div className="t-form-row">
                <div className="field">
                  <label>Region</label>
                  <input
                    value={form.region}
                    onChange={e => handleChange('region', e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Postal Code</label>
                  <input
                    value={form.postalCode}
                    onChange={e => handleChange('postalCode', e.target.value)}
                  />
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
                {isPlayer && (
                  <div className="t-form-row">
                    <div className="field">
                      <label>Height</label>
                      <input
                        value={form.height}
                        onChange={e => handleChange('height', e.target.value)}
                        placeholder={'e.g. 5\'11" or 180 cm'}
                      />
                    </div>
                    <div className="field">
                      <label>Plays</label>
                      <select value={form.plays} onChange={e => handleChange('plays', e.target.value)}>
                        <option value="">Select…</option>
                        <option value="R">Right-handed</option>
                        <option value="L">Left-handed</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>Backhand</label>
                      <select value={form.backhand} onChange={e => handleChange('backhand', e.target.value)}>
                        <option value="">Select…</option>
                        <option value="1H">One-handed</option>
                        <option value="2H">Two-handed</option>
                      </select>
                    </div>
                  </div>
                )}
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

            {/* Equipment */}
            {(isPlayer || isCoach) && (
              <div className="profile-section">
                <div className="profile-section-label">Equipment</div>
                <div className="t-form-row">
                  <div className="field">
                    <label>Racquet Brand</label>
                    <input value={form.racquetBrand} onChange={e => handleChange('racquetBrand', e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Racquet Name</label>
                    <input value={form.racquetName} onChange={e => handleChange('racquetName', e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Racquet Year</label>
                    <input type="number" value={form.racquetYear} onChange={e => handleChange('racquetYear', e.target.value)} />
                  </div>
                </div>
                <div className="t-form-row">
                  <div className="field">
                    <label>String Brand</label>
                    <input value={form.stringBrand} onChange={e => handleChange('stringBrand', e.target.value)} />
                  </div>
                  <div className="field">
                    <label>String Name</label>
                    <input value={form.stringName} onChange={e => handleChange('stringName', e.target.value)} />
                  </div>
                  <div className="field">
                    <label>String Tension</label>
                    <input value={form.stringTension} onChange={e => handleChange('stringTension', e.target.value)} placeholder="e.g. 52 lbs" />
                  </div>
                </div>
                <div className="t-form-row">
                  <div className="field">
                    <label>Shoe Brand</label>
                    <input value={form.shoeBrand} onChange={e => handleChange('shoeBrand', e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Shoe Name</label>
                    <input value={form.shoeName} onChange={e => handleChange('shoeName', e.target.value)} />
                  </div>
                </div>
                <div className="t-form-row">
                  <div className="field">
                    <label>Bag Brand</label>
                    <input value={form.bagBrand} onChange={e => handleChange('bagBrand', e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Bag Name</label>
                    <input value={form.bagName} onChange={e => handleChange('bagName', e.target.value)} />
                  </div>
                </div>
                <div className="t-form-row">
                  <div className="field">
                    <label>Grip Brand</label>
                    <input value={form.gripBrand} onChange={e => handleChange('gripBrand', e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Grip Name</label>
                    <input value={form.gripName} onChange={e => handleChange('gripName', e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            {/* Bio */}
            <div className="profile-section">
              <div className="profile-section-label">About</div>
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
        ) : tab === 'bio' ? (
          <div className="profile-view">
            <div className="profile-section">
              <div className="profile-section-label">Contact</div>
              <Row label="Email" value={user.email} />
              <Row label="Phone" value={form.phone} />
            </div>

            <div className="profile-section">
              <div className="profile-section-label">Location</div>
              <Row label="Home Court" value={form.homeCourt} />
              <Row label="Nationality" value={form.nationality} />
              <Row label="Country" value={form.country} />
              <Row label="City" value={form.city} />
              <Row label="Region" value={form.region} />
              <Row label="Postal Code" value={form.postalCode} />
            </div>

            {isPlayer && (
              <div className="profile-section">
                <div className="profile-section-label">Physical</div>
                <Row label="Age" value={age} />
                <Row label="Gender" value={GENDER_LABELS[form.gender]} />
                <Row label="Height" value={form.height} />
                <Row label="Plays" value={PLAYS_LABELS[form.plays]} />
                <Row label="Backhand" value={BACKHAND_LABELS[form.backhand]} />
              </div>
            )}

            <div className="profile-section">
              <div className="profile-section-label">About</div>
              <div className="profile-about-text">{form.bio || '—'}</div>
            </div>

            {(isPlayer || isCoach) && (
              <div className="profile-section">
                <div className="profile-section-label">Equipment</div>
                <Row label="Racquet Brand" value={form.racquetBrand} />
                <Row label="Racquet Name" value={form.racquetName} />
                <Row label="Racquet Year" value={form.racquetYear} />
                <Row label="String Brand" value={form.stringBrand} />
                <Row label="String Name" value={form.stringName} />
                <Row label="String Tension" value={form.stringTension} />
                <Row label="Shoe Brand" value={form.shoeBrand} />
                <Row label="Shoe Name" value={form.shoeName} />
                <Row label="Bag Brand" value={form.bagBrand} />
                <Row label="Bag Name" value={form.bagName} />
                <Row label="Grip Brand" value={form.gripBrand} />
                <Row label="Grip Name" value={form.gripName} />
              </div>
            )}
          </div>
        ) : (
          <div className="profile-view">
            <div className="profile-section">
              <div className="profile-section-label">Ranking & Status</div>
              <Row label="Role" value={ROLE_LABELS[form.role] || form.role} />
              <Row label="Verified" value={user.isVerified ? 'Yes' : 'No'} />
              {isPlayer && <Row label="AITA Registration No." value={form.aitaReg} />}
              {isPlayer && <Row label="Current AITA Ranking" value={form.ranking} />}
              <Row label="State" value={form.stateAbbr} />
              {(isCoach || isOrganizer) && <Row label="Club / Academy" value={form.clubName} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
