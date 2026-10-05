import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Camera, Check, Loader2, LocateFixed, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/app/contexts/AuthContext';
import { supabase, type Profile } from '@/lib/supabase';
import {
  POSITION_OPTIONS, FOOT_OPTIONS, DAY_OPTIONS, PERIOD_OPTIONS,
  profileCompleteness, detectCity, type ProfileSection,
} from '@/app/lib/profileFields';
import { ProfileCompletenessCard } from './ProfileCompletenessCard';

const BIO_MAX = 160;

/**
 * Edit the player profile one section at a time, each with its own save —
 * no need to go through the onboarding again. ?section=<id> scrolls to and
 * highlights a section (used by the completeness card shortcuts).
 */
export default function EditProfile() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const focus = params.get('section') as ProfileSection | null;
  const { user, profile, refreshProfile } = useAuth();

  useEffect(() => { refreshProfile(); }, []);

  useEffect(() => {
    if (!focus) return;
    const t = setTimeout(() => document.getElementById(`section-${focus}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    return () => clearTimeout(t);
  }, [focus]);

  /** Saves the given fields; returns an error message or null. */
  async function save(fields: Partial<Profile>): Promise<string | null> {
    if (!user) return 'Sessão expirada. Entre novamente.';
    const { data, error } = await supabase.from('profiles').update(fields).eq('id', user.id).select('id');
    if (error || !data?.length) {
      console.error('[EditProfile] save error:', error ?? 'no profile row updated');
      return 'Não foi possível salvar. Tente novamente.';
    }
    await refreshProfile();
    return null;
  }

  if (!profile || !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
      </div>
    );
  }

  const completeness = profileCompleteness(profile);

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      <div className="bg-violet-600 text-white px-6 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate('/profile')}><ArrowLeft className="w-6 h-6" /></button>
        <h1 className="text-lg font-bold">Editar perfil</h1>
      </div>

      <div className="px-5 pt-5 space-y-4">
        <ProfileCompletenessCard completeness={completeness} onPick={s => navigate(`/profile/edit?section=${s}`, { replace: true })} />

        <IdentitySection profile={profile} userId={user.id} save={save} highlight={focus === 'identidade'} />
        <CitySection profile={profile} save={save} highlight={focus === 'cidade'} />
        <GameSection profile={profile} save={save} highlight={focus === 'jogo'} />
        <AvailabilitySection profile={profile} save={save} highlight={focus === 'disponibilidade'} />
        <BioSection profile={profile} save={save} highlight={focus === 'bio'} />
      </div>
    </div>
  );
}

// ── Section shell with its own save button + feedback ──────────────────────

type SaveFn = (fields: Partial<Profile>) => Promise<string | null>;

function Section({ id, title, hint, highlight, dirty, canSave = true, onSave, children }: {
  id: ProfileSection;
  title: string;
  hint?: string;
  highlight: boolean;
  dirty: boolean;
  canSave?: boolean;
  onSave: () => Promise<string | null>;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setBusy(true);
    setError('');
    const err = await onSave();
    setBusy(false);
    if (err) { setError(err); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <section id={`section-${id}`}
      className={`bg-white rounded-2xl border p-5 transition-shadow ${highlight ? 'border-violet-400 ring-4 ring-violet-100' : 'border-gray-200'}`}>
      <h2 className="font-bold text-gray-900">{title}</h2>
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
      <div className="mt-4">{children}</div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex justify-end">
        <button onClick={handleSave} disabled={busy || !dirty || !canSave}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold disabled:bg-gray-100 disabled:text-gray-400">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : null}
          {saved && !dirty ? 'Salvo' : 'Salvar'}
        </button>
      </div>
    </section>
  );
}

function OptionButton({ selected, onClick, children, className = '' }: { selected: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`relative rounded-xl border-2 transition-all ${selected ? 'border-violet-600 bg-violet-50' : 'border-gray-200 hover:border-violet-200'} ${className}`}>
      {children}
      {selected && (
        <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-violet-600 rounded-full flex items-center justify-center">
          <Check className="w-2.5 h-2.5 text-white" />
        </span>
      )}
    </button>
  );
}

// ── Sections ────────────────────────────────────────────────────────────────

function IdentitySection({ profile, userId, save, highlight }: { profile: Profile; userId: string; save: SaveFn; highlight: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(profile.name ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(profile.avatar_url);

  useEffect(() => { setName(profile.name ?? ''); setPreview(profile.avatar_url); setFile(null); }, [profile.name, profile.avatar_url]);

  async function onSave() {
    let avatar_url = profile.avatar_url;
    if (file) {
      const ext = file.name.split('.').pop();
      const path = `${userId}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
      if (upErr) return 'Não foi possível enviar a foto. Tente novamente.';
      // Cache-bust: same path is overwritten, so browsers would keep the old image
      avatar_url = `${supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
    }
    return save({ name: name.trim(), avatar_url });
  }

  const dirty = !!file || name.trim() !== (profile.name ?? '');

  return (
    <Section id="identidade" title="Foto e nome" highlight={highlight} dirty={dirty} canSave={name.trim().length > 0} onSave={onSave}>
      <div className="flex items-center gap-4">
        <button type="button" onClick={() => fileRef.current?.click()}
          className="relative w-20 h-20 rounded-full bg-violet-100 overflow-hidden flex items-center justify-center border-2 border-violet-200 flex-shrink-0">
          {preview
            ? <img src={preview} alt="" className="w-full h-full object-cover" />
            : <span className="text-3xl font-bold text-violet-400">{(name || '?').charAt(0).toUpperCase()}</span>}
          <span className="absolute bottom-0 inset-x-0 bg-black/40 text-white flex justify-center py-1"><Camera className="w-3.5 h-3.5" /></span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); setPreview(URL.createObjectURL(f)); } }} />
        <div className="flex-1">
          <label className="block text-xs font-semibold text-gray-500 mb-1">Nome</label>
          <input value={name} onChange={e => setName(e.target.value)} maxLength={60} placeholder="João Silva"
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-violet-600 focus:outline-none" />
        </div>
      </div>
    </Section>
  );
}

function CitySection({ profile, save, highlight }: { profile: Profile; save: SaveFn; highlight: boolean }) {
  const [city, setCity] = useState(profile.location ?? '');
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState('');

  useEffect(() => { setCity(profile.location ?? ''); }, [profile.location]);

  async function locate() {
    setLocating(true);
    setLocateError('');
    try { setCity(await detectCity()); }
    catch (e: any) { setLocateError(e?.message ?? 'Não foi possível identificar sua cidade.'); }
    finally { setLocating(false); }
  }

  return (
    <Section id="cidade" title="Cidade" hint="Usada no ranking da sua cidade" highlight={highlight}
      dirty={city.trim() !== (profile.location ?? '')} canSave={city.trim().length > 0}
      onSave={() => save({ location: city.trim() })}>
      <div className="relative">
        <input value={city} onChange={e => { setCity(e.target.value); setLocateError(''); }} placeholder="São Paulo, SP" maxLength={80}
          className="w-full px-4 py-3 pr-12 border-2 border-gray-200 rounded-xl focus:border-violet-600 focus:outline-none" />
        <button type="button" onClick={locate} disabled={locating} title="Usar minha localização"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-violet-600 disabled:text-gray-300">
          {locating ? <Loader2 className="w-5 h-5 animate-spin" /> : <LocateFixed className="w-5 h-5" />}
        </button>
      </div>
      {locateError && <p className="text-xs text-red-500 mt-1.5">{locateError}</p>}
    </Section>
  );
}

function GameSection({ profile, save, highlight }: { profile: Profile; save: SaveFn; highlight: boolean }) {
  const [position, setPosition] = useState(profile.preferred_position ?? '');
  const [foot, setFoot] = useState<string>(profile.dominant_foot ?? '');

  useEffect(() => { setPosition(profile.preferred_position ?? ''); setFoot(profile.dominant_foot ?? ''); }, [profile.preferred_position, profile.dominant_foot]);

  const dirty = position !== (profile.preferred_position ?? '') || foot !== (profile.dominant_foot ?? '');

  return (
    <Section id="jogo" title="Como você joga" highlight={highlight} dirty={dirty} canSave={!!position && !!foot}
      onSave={() => save({ preferred_position: position, dominant_foot: foot as Profile['dominant_foot'] })}>
      <p className="text-xs font-semibold text-gray-500 mb-2">Posição</p>
      <div className="grid grid-cols-3 gap-2">
        {POSITION_OPTIONS.map(p => (
          <OptionButton key={p.value} selected={position === p.value} onClick={() => setPosition(p.value)} className="flex flex-col items-center gap-1 p-3">
            <span className="text-2xl">{p.emoji}</span>
            <span className="text-xs font-semibold text-gray-700">{p.label}</span>
          </OptionButton>
        ))}
      </div>
      <p className="text-xs font-semibold text-gray-500 mt-4 mb-2">Pé dominante</p>
      <div className="grid grid-cols-3 gap-2">
        {FOOT_OPTIONS.map(f => (
          <OptionButton key={f.value} selected={foot === f.value} onClick={() => setFoot(f.value)} className="flex flex-col items-center gap-1 p-3">
            <span className="text-xl">{f.emoji}</span>
            <span className="text-xs font-semibold text-gray-700">{f.label}</span>
          </OptionButton>
        ))}
      </div>
    </Section>
  );
}

function AvailabilitySection({ profile, save, highlight }: { profile: Profile; save: SaveFn; highlight: boolean }) {
  const [days, setDays] = useState<string[]>(profile.availability?.days ?? []);
  const [periods, setPeriods] = useState<string[]>(profile.availability?.periods ?? []);

  useEffect(() => {
    setDays(profile.availability?.days ?? []);
    setPeriods(profile.availability?.periods ?? []);
  }, [JSON.stringify(profile.availability)]);

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);
  const same = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x));
  const dirty = !same(days, profile.availability?.days ?? []) || !same(periods, profile.availability?.periods ?? []);

  return (
    <Section id="disponibilidade" title="Quando você joga" hint="Ajuda a te conectar com jogadores da mesma agenda" highlight={highlight} dirty={dirty}
      onSave={() => save({ availability: days.length || periods.length ? { days, periods } : null })}>
      <p className="text-xs font-semibold text-gray-500 mb-2">Dias da semana</p>
      <div className="flex flex-wrap gap-1.5">
        {DAY_OPTIONS.map(d => (
          <button key={d.value} type="button" onClick={() => setDays(prev => toggle(prev, d.value))}
            className={`px-3 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${days.includes(d.value) ? 'bg-violet-600 border-violet-600 text-white' : 'border-gray-200 text-gray-600 hover:border-violet-200'}`}>
            {d.label}
          </button>
        ))}
      </div>
      <p className="text-xs font-semibold text-gray-500 mt-4 mb-2">Horário preferido</p>
      <div className="grid grid-cols-3 gap-2">
        {PERIOD_OPTIONS.map(p => (
          <OptionButton key={p.value} selected={periods.includes(p.value)} onClick={() => setPeriods(prev => toggle(prev, p.value))} className="py-3 px-2 text-center">
            <div className="text-sm font-semibold text-gray-900">{p.label}</div>
            <div className="text-[11px] text-gray-400">{p.sub}</div>
          </OptionButton>
        ))}
      </div>
    </Section>
  );
}

function BioSection({ profile, save, highlight }: { profile: Profile; save: SaveFn; highlight: boolean }) {
  const [bio, setBio] = useState(profile.bio ?? '');
  useEffect(() => { setBio(profile.bio ?? ''); }, [profile.bio]);

  return (
    <Section id="bio" title="Sobre você" hint="Opcional — aparece no seu perfil público" highlight={highlight}
      dirty={bio.trim() !== (profile.bio ?? '')} onSave={() => save({ bio: bio.trim() || null })}>
      <textarea value={bio} onChange={e => setBio(e.target.value.slice(0, BIO_MAX))} rows={3}
        placeholder="Ex: Jogo futevôlei há 3 anos, procuro dupla pra jogar à noite."
        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-violet-600 focus:outline-none resize-none text-sm" />
      <p className="text-right text-[11px] text-gray-400">{bio.length}/{BIO_MAX}</p>
    </Section>
  );
}
