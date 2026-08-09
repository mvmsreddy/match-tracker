import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../../api';
import {
  PROFILE_VISIBILITY,
  PRIVACY_TOGGLES,
  DEFAULT_PRIVACY_SETTINGS,
  slugifyProfileHandle,
  isValidProfileSlug,
  publicProfileUrl,
  linkOnlyProfileUrl,
  mergePrivacySettings,
} from '../../lib/publicProfile';
import { Card } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Textarea } from '@/components/primitives/textarea';

export default function ProfilePrivacyCard({ user, refreshProfile }) {
  const [visibility, setVisibility] = useState(user.profileVisibility || 'private');
  const [slug, setSlug] = useState(user.profileSlug || slugifyProfileHandle(user.displayName));
  const [publicBio, setPublicBio] = useState(user.publicBio || '');
  const [privacy, setPrivacy] = useState(() => mergePrivacySettings(user.privacySettings));
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [slugOk, setSlugOk] = useState(true);

  const shareUrl = useMemo(() => {
    if (visibility === 'link') return linkOnlyProfileUrl(user.profileShareToken);
    if (visibility === 'public' && slug) return publicProfileUrl(slug);
    return null;
  }, [visibility, slug, user.profileShareToken]);

  useEffect(() => {
    if (!slug || visibility === 'private') { setSlugOk(true); return; }
    if (!isValidProfileSlug(slug)) { setSlugOk(false); return; }
    let cancelled = false;
    api.checkProfileSlugAvailable(slug, user.id).then((ok) => {
      if (!cancelled) setSlugOk(ok);
    }).catch(() => { if (!cancelled) setSlugOk(false); });
    return () => { cancelled = true; };
  }, [slug, user.id, visibility]);

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      if (visibility !== 'private') {
        if (!slug.trim()) throw new Error('Choose a profile handle for sharing.');
        if (!isValidProfileSlug(slug)) throw new Error('Handle: 3–40 chars, lowercase letters, numbers, hyphens.');
        if (!slugOk) throw new Error('That handle is already taken.');
      }
      await api.updateProfileSharing(user.id, {
        profileVisibility: visibility,
        profileSlug: visibility === 'private' ? user.profileSlug : slug.toLowerCase(),
        publicBio,
        privacySettings: privacy,
      });
      await refreshProfile();
    } catch (e) {
      setError(e.message || 'Could not save sharing settings');
    } finally {
      setSaving(false);
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy link');
    }
  }

  return (
    <Card className="p-4 sm:p-6 space-y-4">
      <div>
        <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Public profile & privacy</div>
        <p className="text-sm text-muted-foreground mt-1">
          Share a public card so other players can see your stats — not your match history or contact details.
        </p>
      </div>

      <div className="space-y-2">
        {Object.values(PROFILE_VISIBILITY).map((v) => (
          <label key={v.id} className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              className="accent-primary mt-1"
              checked={visibility === v.id}
              onChange={() => setVisibility(v.id)}
            />
            <span>
              <span className="font-semibold">{v.label}</span>
              <span className="block text-xs text-muted-foreground">{v.description}</span>
            </span>
          </label>
        ))}
      </div>

      {visibility !== 'private' && (
        <>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Profile handle (URL)
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground shrink-0">/p/</span>
              <Input
                value={slug}
                onChange={(e) => setSlug(slugifyProfileHandle(e.target.value))}
                placeholder="madhu-hyd"
              />
            </div>
            {!slugOk && <span className="text-destructive text-xs">Handle unavailable</span>}
          </label>

          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Public bio (shown on shared profile)
            <Textarea
              rows={3}
              value={publicBio}
              onChange={(e) => setPublicBio(e.target.value)}
              placeholder="Competitive U18 · hard court · available evenings in Hyderabad"
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            {PRIVACY_TOGGLES.map((t) => (
              <label key={t.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={!!privacy[t.key]}
                  onChange={(e) => setPrivacy((prev) => ({ ...prev, [t.key]: e.target.checked }))}
                />
                {t.label}
              </label>
            ))}
          </div>

          {shareUrl && (
            <div className="flex flex-wrap gap-2 items-center">
              <Input readOnly value={shareUrl} className="text-xs font-mono flex-1 min-w-48" />
              <Button type="button" variant="outline" size="sm" onClick={copyLink}>
                {copied ? 'Copied!' : 'Copy link'}
              </Button>
              <Link to={visibility === 'link' ? `/p/t/${user.profileShareToken}` : `/p/${slug}`} target="_blank">
                <Button type="button" variant="outline" size="sm">Preview</Button>
              </Link>
            </div>
          )}
        </>
      )}

      {error && <div className="text-sm text-destructive">{error}</div>}

      <Button size="sm" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save sharing settings'}
      </Button>
    </Card>
  );
}
