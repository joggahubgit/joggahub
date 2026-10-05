import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, Camera, Loader2, Zap, LocateFixed } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { FUTEVOLEI_LEVELS } from '@/app/lib/futevoleiLevels';
import {
  POSITION_OPTIONS as POSITIONS, FOOT_OPTIONS, DAY_OPTIONS as DAYS, PERIOD_OPTIONS as PERIODS, detectCity,
} from '@/app/lib/profileFields';

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  // The futevôlei level step only exists for players without a rating yet —
  // once set, it can only go down (Profile → Ajustar nível) or move with matches
  const [hasRating, setHasRating] = useState(false);
  const TOTAL_STEPS = hasRating ? 3 : 4;

  useEffect(() => {
    if (!user) return;
    supabase.from('player_ratings').select('player_id')
      .eq('player_id', user.id).eq('sport_type', 'futevolei').maybeSingle()
      .then(({ data }) => setHasRating(!!data));
  }, [user?.id]);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState('');
  const [saveError, setSaveError] = useState('');

  // Step 1
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile?.avatar_url ?? null);
  const [name, setName] = useState(profile?.name ?? '');
  const [city, setCity] = useState(profile?.location ?? '');

  // Step 2
  const [position, setPosition] = useState(profile?.preferred_position ?? '');
  const [foot, setFoot] = useState<string>(profile?.dominant_foot ?? '');

  // Step 3
  const [days, setDays] = useState<string[]>(profile?.availability?.days ?? []);
  const [periods, setPeriods] = useState<string[]>(profile?.availability?.periods ?? []);

  // Step 4 (optional — futevôlei only, for now)
  const [futevoleiLevel, setFutevoleiLevel] = useState('');

  async function detectLocation() {
    setLocating(true);
    setLocateError('');
    try {
      setCity(await detectCity());
    } catch (e: any) {
      setLocateError(e?.message ?? 'Não foi possível identificar sua cidade.');
    } finally {
      setLocating(false);
    }
  }

  function toggleDay(d: string) {
    setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  }
  function togglePeriod(p: string) {
    setPeriods(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  function canAdvance() {
    if (step === 1) return name.trim().length > 0 && city.trim().length > 0;
    if (step === 2) return position !== '' && foot !== '';
    return true; // step 3 is skippable
  }

  async function handleFinish() {
    if (!user) return;
    setSaving(true);
    setSaveError('');
    try {
      let avatar_url = profile?.avatar_url ?? null;

      // Upload avatar if user picked a new one
      if (avatarFile) {
        const ext = avatarFile.name.split('.').pop();
        const path = `${user.id}/avatar.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('avatars')
          .upload(path, avatarFile, { upsert: true });
        if (!upErr) {
          const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
          avatar_url = publicUrl;
        }
      }

      const isFirstTime = !profile?.preferred_position;

      // Save profile fields (without XP — handled separately below).
      // update, not upsert: the row always exists (created on signup by the
      // on_auth_user_created trigger) and profiles has no INSERT policy, so an
      // upsert was rejected by RLS for every user — and the error was ignored.
      const { data: savedRows, error: profileErr } = await supabase.from('profiles').update({
        name: name.trim(),
        location: city.trim(),
        avatar_url,
        preferred_position: position,
        dominant_foot: foot || null,
        availability: (days.length > 0 || periods.length > 0) ? { days, periods } : null,
        onboarding_completed: true,
      }).eq('id', user.id).select('id');
      // No error but no row: the profile doesn't exist — nothing was saved
      if (profileErr || !savedRows?.length) {
        console.error('[Onboarding] profile save error:', profileErr ?? 'no profile row updated');
        setSaveError('Não foi possível salvar seu perfil. Tente novamente.');
        return;
      }

      // Increment XP directly in DB to avoid stale-context race condition
      if (isFirstTime) {
        await supabase.rpc('increment_xp', { user_id: user.id, amount: 20 });
      }

      // Self-declared starting level for futevôlei — only when the player has
      // none yet (the step is hidden otherwise). declare_initial_rating also
      // writes the baseline history point and enforces the 5.5 cap server-side.
      if (futevoleiLevel && !hasRating) {
        const level = FUTEVOLEI_LEVELS.find(l => l.key === futevoleiLevel);
        if (level) {
          const { error: ratingErr } = await supabase.rpc('declare_initial_rating', {
            p_sport: 'futevolei',
            p_rating: level.rating,
          });
          // Profile is already saved — a failed level isn't worth blocking on
          if (ratingErr) console.error('[Onboarding] initial rating error:', ratingErr);
        }
      }

      // Mark onboarding as done in localStorage so ProtectedRoute doesn't
      // redirect back while the profile context is still updating
      localStorage.setItem(`onboarding_done_${user.id}`, '1');

      await refreshProfile();
      navigate('/home', { state: { firstLogin: isFirstTime } });
    } catch (err) {
      console.error(err);
      setSaveError('Não foi possível salvar seu perfil. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  async function handleNext() {
    if (step < TOTAL_STEPS) {
      setStep(s => s + 1);
    } else {
      await handleFinish();
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Progress */}
      <div className="bg-violet-600 text-white px-6 pt-12 pb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-violet-200">Passo {step} de {TOTAL_STEPS}</span>
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i < step ? 'bg-white' : 'bg-violet-400'}`}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 px-6 py-8 flex flex-col">

        {/* ── Step 1: Identidade ── */}
        {step === 1 && (
          <div className="flex flex-col gap-6 flex-1">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Vamos montar seu perfil</h2>
              <p className="text-gray-500 mt-1">Seus companheiros de jogo vão te ver assim</p>
            </div>

            {/* Avatar */}
            <div className="flex flex-col items-center gap-3">
              <div
                className="relative w-24 h-24 rounded-full bg-violet-100 flex items-center justify-center cursor-pointer overflow-hidden border-4 border-white shadow-lg"
                onClick={() => fileRef.current?.click()}
              >
                {avatarPreview
                  ? <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
                  : <span className="text-3xl font-bold text-violet-400">{name.charAt(0).toUpperCase() || '?'}</span>
                }
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                  <Camera className="w-6 h-6 text-white" />
                </div>
              </div>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="text-sm text-violet-600 font-semibold"
              >
                {avatarPreview ? 'Trocar foto' : 'Adicionar foto'}
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Nome</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-4 py-3.5 border-2 border-gray-200 rounded-xl focus:border-violet-600 focus:outline-none text-base"
                placeholder="João Silva"
              />
            </div>

            {/* City */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Cidade</label>
              <div className="relative">
                <input
                  type="text"
                  value={city}
                  onChange={e => { setCity(e.target.value); setLocateError(''); }}
                  className="w-full px-4 py-3.5 pr-14 border-2 border-gray-200 rounded-xl focus:border-violet-600 focus:outline-none text-base"
                  placeholder="São Paulo, SP"
                />
                <button
                  type="button"
                  onClick={detectLocation}
                  disabled={locating}
                  title="Usar minha localização"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-violet-600 hover:text-violet-800 disabled:text-gray-300 transition-colors"
                >
                  {locating
                    ? <Loader2 className="w-5 h-5 animate-spin" />
                    : <LocateFixed className="w-5 h-5" />
                  }
                </button>
              </div>
              {locateError && (
                <p className="text-xs text-red-500 mt-1.5">{locateError}</p>
              )}
            </div>
          </div>
        )}

        {/* ── Step 2: Seu jogo ── */}
        {step === 2 && (
          <div className="flex flex-col gap-6 flex-1">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Como você joga?</h2>
              <p className="text-gray-500 mt-1">Essas informações aparecem no seu perfil</p>
            </div>

            {/* Position */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">Sua posição</label>
              <div className="grid grid-cols-3 gap-2">
                {POSITIONS.map(p => (
                  <button
                    key={p.value}
                    onClick={() => setPosition(p.value)}
                    className={`relative flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all ${
                      position === p.value
                        ? 'border-violet-600 bg-violet-50'
                        : 'border-gray-200 hover:border-violet-200'
                    }`}
                  >
                    <span className="text-2xl">{p.emoji}</span>
                    <span className="text-xs font-semibold text-gray-700">{p.label}</span>
                    {position === p.value && (
                      <div className="absolute top-1.5 right-1.5 w-4 h-4 bg-violet-600 rounded-full flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Dominant foot */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">Pé dominante</label>
              <div className="flex gap-2">
                {FOOT_OPTIONS.map(f => (
                  <button
                    key={f.value}
                    onClick={() => setFoot(f.value)}
                    className={`flex-1 flex flex-col items-center gap-1 py-3 px-2 rounded-xl border-2 transition-all ${
                      foot === f.value
                        ? 'border-violet-600 bg-violet-50'
                        : 'border-gray-200 hover:border-violet-200'
                    }`}
                  >
                    <span className="text-xl">{f.emoji}</span>
                    <span className="text-xs font-semibold text-gray-700">{f.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Step 3: Disponibilidade ── */}
        {step === 3 && (
          <div className="flex flex-col gap-6 flex-1">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Quando você joga?</h2>
              <p className="text-gray-500 mt-1">Vamos te conectar com jogadores com a mesma agenda</p>
            </div>

            {/* Days */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">Dias da semana</label>
              <div className="flex gap-1.5 flex-wrap">
                {DAYS.map(d => (
                  <button
                    key={d.value}
                    onClick={() => toggleDay(d.value)}
                    className={`px-3 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                      days.includes(d.value)
                        ? 'bg-violet-600 border-violet-600 text-white'
                        : 'border-gray-200 text-gray-600 hover:border-violet-200'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Periods */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">Horário preferido</label>
              <div className="flex flex-col gap-2">
                {PERIODS.map(p => (
                  <button
                    key={p.value}
                    onClick={() => togglePeriod(p.value)}
                    className={`flex items-center justify-between px-4 py-3.5 rounded-xl border-2 transition-all ${
                      periods.includes(p.value)
                        ? 'border-violet-600 bg-violet-50'
                        : 'border-gray-200 hover:border-violet-200'
                    }`}
                  >
                    <div className="text-left">
                      <div className="font-semibold text-gray-900">{p.label}</div>
                      <div className="text-xs text-gray-400">{p.sub}</div>
                    </div>
                    {periods.includes(p.value) && (
                      <div className="w-5 h-5 bg-violet-600 rounded-full flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* XP hint */}
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mt-auto">
              <Zap className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <p className="text-sm text-amber-800">
                <strong>+20 XP</strong> por completar seu perfil — você começa na frente!
              </p>
            </div>
          </div>
        )}

        {/* ── Step 4: Nível no futevôlei (opcional) ── */}
        {step === 4 && (
          <div className="flex flex-col gap-6 flex-1">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Qual seu nível no futevôlei?</h2>
              <p className="text-gray-500 mt-1">
                Só pra começar sua pontuação num lugar razoável — ela se ajusta sozinha conforme você for jogando. Pode pular se não joga futevôlei.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              {FUTEVOLEI_LEVELS.map(l => (
                <button
                  key={l.key}
                  onClick={() => setFutevoleiLevel(prev => prev === l.key ? '' : l.key)}
                  className={`flex items-center justify-between px-4 py-3.5 rounded-xl border-2 text-left transition-all ${
                    futevoleiLevel === l.key
                      ? 'border-violet-600 bg-violet-50'
                      : 'border-gray-200 hover:border-violet-200'
                  }`}
                >
                  <div>
                    <div className="font-semibold text-gray-900">{l.label}</div>
                    <div className="text-xs text-gray-400">{l.description}</div>
                  </div>
                  {futevoleiLevel === l.key && (
                    <div className="w-5 h-5 bg-violet-600 rounded-full flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {saveError && (
          <p className="mt-8 -mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{saveError}</p>
        )}

        {/* CTA */}
        <button
          onClick={handleNext}
          disabled={saving || !canAdvance()}
          className="w-full bg-violet-600 text-white py-4 rounded-xl font-bold text-base hover:bg-violet-700 transition-colors disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed mt-8 flex items-center justify-center gap-2"
        >
          {saving
            ? <><Loader2 className="w-5 h-5 animate-spin" /> Salvando...</>
            : step === TOTAL_STEPS
              ? <><Zap className="w-5 h-5" /> Finalizar e ganhar 20 XP</>
              : <><span>Continuar</span><ChevronRight className="w-5 h-5" /></>
          }
        </button>
      </div>
    </div>
  );
}
