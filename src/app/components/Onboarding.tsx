import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, Camera, Loader2, Zap, LocateFixed } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '@/lib/supabase';

const POSITIONS = [
  { value: 'goalkeeper', label: 'Goleiro', emoji: '🧤' },
  { value: 'defender', label: 'Zagueiro', emoji: '🛡️' },
  { value: 'fullback', label: 'Lateral', emoji: '⚡' },
  { value: 'midfielder', label: 'Volante', emoji: '⚙️' },
  { value: 'playmaker', label: 'Meia', emoji: '🎯' },
  { value: 'forward', label: 'Atacante', emoji: '🔥' },
];

const DAYS = [
  { value: 'mon', label: 'Seg' },
  { value: 'tue', label: 'Ter' },
  { value: 'wed', label: 'Qua' },
  { value: 'thu', label: 'Qui' },
  { value: 'fri', label: 'Sex' },
  { value: 'sat', label: 'Sáb' },
  { value: 'sun', label: 'Dom' },
];

const PERIODS = [
  { value: 'morning', label: 'Manhã', sub: '06h–12h' },
  { value: 'afternoon', label: 'Tarde', sub: '12h–18h' },
  { value: 'evening', label: 'Noite', sub: '18h–23h' },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const TOTAL_STEPS = 3;
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState('');

  // Step 1
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile?.avatar_url ?? null);
  const [name, setName] = useState(profile?.name ?? '');
  const [city, setCity] = useState(profile?.location ?? '');

  // Step 2
  const [position, setPosition] = useState('');
  const [foot, setFoot] = useState('');

  // Step 3
  const [days, setDays] = useState<string[]>([]);
  const [periods, setPeriods] = useState<string[]>([]);

  async function detectLocation() {
    if (!navigator.geolocation) {
      setLocateError('Geolocalização não suportada pelo seu navegador.');
      return;
    }
    setLocating(true);
    setLocateError('');
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json&accept-language=pt-BR`,
            { headers: { 'User-Agent': 'JoggaHub/1.0' } }
          );
          const data = await res.json();
          const city =
            data.address?.city ||
            data.address?.town ||
            data.address?.village ||
            data.address?.municipality ||
            '';
          const state = data.address?.state_code || data.address?.state || '';
          setCity(city && state ? `${city}, ${state}` : city || state);
        } catch {
          setLocateError('Não foi possível identificar sua cidade.');
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocateError('Permissão de localização negada.');
        setLocating(false);
      },
      { timeout: 8000 }
    );
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

  async function handleSkip() {
    if (!user) return;
    // Save whatever has been filled so far (name/city from step 1 if present)
    if (name.trim() || city.trim()) {
      await supabase.from('profiles').upsert({
        id: user.id,
        ...(name.trim() && { name: name.trim() }),
        ...(city.trim() && { location: city.trim() }),
      }, { onConflict: 'id' });
    }
    localStorage.setItem(`onboarding_done_${user.id}`, '1');
    navigate('/home');
  }

  async function handleFinish() {
    if (!user) return;
    setSaving(true);
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

      // Save profile fields (without XP — handled separately below)
      await supabase.from('profiles').upsert({
        id: user.id,
        name: name.trim(),
        location: city.trim(),
        avatar_url,
        preferred_position: position,
        dominant_foot: foot || null,
        availability: (days.length > 0 || periods.length > 0) ? { days, periods } : null,
      }, { onConflict: 'id' });

      // Increment XP directly in DB to avoid stale-context race condition
      if (isFirstTime) {
        await supabase.rpc('increment_xp', { user_id: user.id, amount: 20 });
      }

      // Mark onboarding as done in localStorage so ProtectedRoute doesn't
      // redirect back while the profile context is still updating
      localStorage.setItem(`onboarding_done_${user.id}`, '1');

      await refreshProfile();
      navigate('/home', { state: { firstLogin: isFirstTime } });
    } catch (err) {
      console.error(err);
      navigate('/home');
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
          <button
            onClick={step === TOTAL_STEPS ? handleFinish : handleSkip}
            className="text-sm text-violet-200 underline"
          >
            Pular
          </button>
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
                {[
                  { value: 'right', label: 'Destro', emoji: '🦶' },
                  { value: 'left', label: 'Canhoto', emoji: '🦶' },
                  { value: 'both', label: 'Ambidestro', emoji: '⚡' },
                ].map(f => (
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
