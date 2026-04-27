import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase-gestor';
import { Camera, X, Check, ChevronRight, ChevronLeft, Upload } from 'lucide-react';

interface LoginPageProps {
  onLogin?: () => void;
}

type Mode = 'login' | 'signup';

const AMENITIES = ['Banheiro', 'Vestiário', 'Churrasqueira', 'Área para Festa', 'Estacionamento', 'Lanchonete', 'Iluminação'];
const COURT_TYPES = [
  { id: 'society', label: 'Society', desc: 'Futebol society 7x7' },
  { id: 'futsal', label: 'Futsal', desc: 'Quadra de futsal' },
];

async function uploadPhoto(file: File, userId: string, index: number): Promise<string | null> {
  const ext = file.name.split('.').pop();
  const path = `${userId}/${Date.now()}_${index}.${ext}`;
  const { error } = await supabase.storage.from('venue-photos').upload(path, file, { upsert: true });
  if (error) { console.error('Upload error:', error); return null; }
  const { data } = supabase.storage.from('venue-photos').getPublicUrl(path);
  return data.publicUrl;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [mode, setMode] = useState<Mode>('login');

  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Signup state - step 1 (account)
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [createdUserId, setCreatedUserId] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);

  // Signup state - step 2 (club info)
  const [name, setName] = useState('');
  const [phoneDdi, setPhoneDdi] = useState('+55');
  const [phoneDdd, setPhoneDdd] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [cep, setCep] = useState('');
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState('');
  const [addressStreet, setAddressStreet] = useState('');
  const [addressNumber, setAddressNumber] = useState('');
  const [addressNeighborhood, setAddressNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [description, setDescription] = useState('');

  // Derived full phone string for storage
  const phone = phoneDdd
    ? `${phoneDdi} (${phoneDdd}) ${phoneNumber}`
    : `${phoneDdi} ${phoneNumber}`;

  // Derived full address string for storage
  const address = [
    addressStreet,
    addressNumber,
    addressNeighborhood,
  ].filter(Boolean).join(', ');

  // Signup state - step 3 (photos + details)
  const [mainPhoto, setMainPhoto] = useState<File | null>(null);
  const [mainPhotoPreview, setMainPhotoPreview] = useState<string>('');
  const [extraPhotos, setExtraPhotos] = useState<File[]>([]);
  const [extraPreviews, setExtraPreviews] = useState<string[]>([]);
  const [courts, setCourts] = useState([{ name: '', sportType: 'society', pricePerHour: '120' }]);
  const [amenities, setAmenities] = useState<string[]>([]);

  const [signupError, setSignupError] = useState('');
  const [signupLoading, setSignupLoading] = useState(false);

  const mainPhotoRef = useRef<HTMLInputElement>(null);
  const extraPhotoRef = useRef<HTMLInputElement>(null);

  // ─── Login ───────────────────────────────────────────────
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword });
    if (error) setLoginError('Email ou senha incorretos.');
    else onLogin?.();
    setLoginLoading(false);
  }

  // ─── Signup steps ────────────────────────────────────────
  function validateStep1() {
    if (!email || !password || !confirmPassword) return 'Preencha todos os campos.';
    if (password !== confirmPassword) return 'As senhas não coincidem.';
    if (password.length < 6) return 'Senha deve ter pelo menos 6 caracteres.';
    return null;
  }

  function validateStep2() {
    if (!name) return 'Informe o nome do clube.';
    if (!phoneDdd || !phoneNumber) return 'Preencha o telefone completo com DDD.';
    if (!cep || !addressStreet) return 'Informe o CEP para buscar o endereço.';
    if (!addressNumber) return 'Informe o número do endereço.';
    if (!city) return 'Cidade não encontrada. Verifique o CEP.';
    return null;
  }

  async function handleCepBlur() {
    const raw = cep.replace(/\D/g, '');
    if (raw.length !== 8) return;
    setCepLoading(true);
    setCepError('');
    try {
      const res = await fetch(`https://viacep.com.br/ws/${raw}/json/`);
      const data = await res.json();
      if (data.erro) { setCepError('CEP não encontrado.'); return; }
      setAddressStreet(data.logradouro ?? '');
      setAddressNeighborhood(data.bairro ?? '');
      setCity(data.localidade ?? '');
    } catch {
      setCepError('Erro ao buscar CEP. Verifique sua conexão.');
    } finally {
      setCepLoading(false);
    }
  }

  function formatCep(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 8);
    if (digits.length > 5) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
    return digits;
  }

  function formatDdd(value: string) {
    return value.replace(/\D/g, '').slice(0, 2);
  }

  function formatPhoneNumber(value: string, ddi: string) {
    const digits = value.replace(/\D/g, '');
    if (ddi === '+55') {
      // Brazil: 9 9999-9999
      const d = digits.slice(0, 9);
      if (d.length > 5) return `${d.slice(0, 5)}-${d.slice(5)}`;
      return d;
    }
    // Ireland: free format up to 10 digits
    return digits.slice(0, 10);
  }

  function validateStep3() {
    if (!mainPhoto) return 'A foto principal é obrigatória.';
    if (courts.length === 0) return 'Adicione pelo menos uma quadra.';
    for (const c of courts) {
      if (!c.name.trim()) return 'Informe o nome de cada quadra.';
      if (!c.pricePerHour || Number(c.pricePerHour) <= 0) return 'Informe o preço por hora de cada quadra.';
    }
    return null;
  }

  function addCourt() {
    if (courts.length >= 3) return;
    setCourts(prev => [...prev, { name: '', sportType: 'society', pricePerHour: '120' }]);
  }

  function removeCourt(idx: number) {
    setCourts(prev => prev.filter((_, i) => i !== idx));
  }

  function updateCourt(idx: number, field: 'name' | 'sportType' | 'pricePerHour', value: string) {
    setCourts(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  }

  async function handleEmailBlur() {
    if (!email || !email.includes('@')) return;
    setEmailTaken(false);
    setCheckingEmail(true);
    // signUp with a dummy password — if identities[] is empty, email is already registered
    // Supabase does NOT create a duplicate; it returns the existing user with empty identities
    const { data } = await supabase.auth.signUp({ email, password: 'dummy-check-000' });
    setCheckingEmail(false);
    if (data?.user?.identities?.length === 0) {
      setEmailTaken(true);
    }
  }

  async function nextStep() {
    setSignupError('');
    if (step === 1) {
      if (emailTaken) return; // already blocked by inline message
      const err = validateStep1();
      if (err) { setSignupError(err); return; }

      // Create auth account now (real password this time)
      setSignupLoading(true);
      const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
      setSignupLoading(false);

      if (authError) {
        setSignupError(authError.message);
        return;
      }

      // Double-check: if identities is empty, email was taken (race condition safety)
      if (authData?.user?.identities?.length === 0) {
        setEmailTaken(true);
        return;
      }

      const userId = authData.user?.id;
      if (!userId) { setSignupError('Erro ao criar conta. Tente novamente.'); return; }
      setCreatedUserId(userId);
    }
    if (step === 2) {
      const err = validateStep2(); if (err) { setSignupError(err); return; }
    }
    setStep(s => s + 1);
  }

  function handleMainPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMainPhoto(file);
    setMainPhotoPreview(URL.createObjectURL(file));
  }

  function handleExtraPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const remaining = 3 - extraPhotos.length;
    const toAdd = files.slice(0, remaining);
    setExtraPhotos(prev => [...prev, ...toAdd]);
    setExtraPreviews(prev => [...prev, ...toAdd.map(f => URL.createObjectURL(f))]);
  }

  function removeExtraPhoto(idx: number) {
    setExtraPhotos(prev => prev.filter((_, i) => i !== idx));
    setExtraPreviews(prev => prev.filter((_, i) => i !== idx));
  }

  function toggleAmenity(a: string) {
    setAmenities(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);
  }

  async function handleSignup() {
    const err = validateStep3(); if (err) { setSignupError(err); return; }
    setSignupLoading(true);
    setSignupError('');

    try {
      // 1. Auth account already created at Step 1 — just use stored userId
      const userId = createdUserId;
      if (!userId) throw new Error('Sessão expirada. Volte ao início e tente novamente.');

      // 2. Upload photos
      const allPhotos: string[] = [];
      if (mainPhoto) {
        const url = await uploadPhoto(mainPhoto, userId, 0);
        if (url) allPhotos.push(url);
      }
      for (let i = 0; i < extraPhotos.length; i++) {
        const url = await uploadPhoto(extraPhotos[i], userId, i + 1);
        if (url) allPhotos.push(url);
      }

      // 3. Create venue
      const { data: venue, error: venueError } = await supabase.from('venues').insert({
        admin_id: userId,
        name, phone, email, address, city, description,
      }).select().single();
      if (venueError) throw new Error('Erro ao criar venue: ' + venueError.message);

      // 4. Create each court
      for (const court of courts) {
        await supabase.from('courts').insert({
          venue_id: venue.id,
          name: court.name.trim(),
          sport_type: court.sportType,
          is_active: true,
          price_per_hour: Number(court.pricePerHour) || 120,
          amenities,
          images: allPhotos,
        });
      }

      // 5. Sign in immediately (if email confirmation disabled)
      await supabase.auth.signInWithPassword({ email, password });
      onLogin?.();
    } catch (e: any) {
      setSignupError(e.message ?? 'Erro ao criar conta.');
    } finally {
      setSignupLoading(false);
    }
  }

  // ─── Render ──────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-purple-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Logo */}
        <div className="text-center pt-8 pb-4 px-8">
          <div className="w-16 h-16 bg-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <span className="text-white text-2xl font-bold">J</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">JoggaHub</h1>
          <p className="text-gray-500 text-sm mt-1">Gestor de Quadras</p>
        </div>

        {/* Mode toggle */}
        <div className="px-8 pb-4">
          <div className="flex bg-gray-100 rounded-xl p-1">
            {(['login', 'signup'] as Mode[]).map(m => (
              <button key={m} type="button"
                onClick={() => { setMode(m); setSignupError(''); setLoginError(''); setStep(1); }}
                className={`flex-1 py-2 rounded-lg font-semibold text-sm transition-all ${mode === m ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500'}`}>
                {m === 'login' ? 'Entrar' : 'Criar conta'}
              </button>
            ))}
          </div>
        </div>

        {/* ── LOGIN ── */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="px-8 pb-8 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                placeholder="clube@email.com" required
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
              <input type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)}
                placeholder="••••••••" required
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>
            {loginError && <p className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">{loginError}</p>}
            <button type="submit" disabled={loginLoading}
              className="w-full bg-purple-600 text-white py-3 rounded-xl font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50">
              {loginLoading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        )}

        {/* ── SIGNUP ── */}
        {mode === 'signup' && (
          <div className="px-8 pb-8">
            {/* Step indicator */}
            <div className="flex items-center gap-2 mb-6">
              {[1, 2, 3].map(s => (
                <div key={s} className="flex items-center gap-2 flex-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                    step > s ? 'bg-green-500 text-white' : step === s ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {step > s ? <Check className="w-4 h-4" /> : s}
                  </div>
                  <span className={`text-xs font-medium hidden sm:block ${step === s ? 'text-purple-600' : 'text-gray-400'}`}>
                    {s === 1 ? 'Conta' : s === 2 ? 'Clube' : 'Detalhes'}
                  </span>
                  {s < 3 && <div className={`flex-1 h-0.5 ${step > s ? 'bg-green-500' : 'bg-gray-200'}`} />}
                </div>
              ))}
            </div>

            {/* Step 1: Account */}
            {step === 1 && (
              <div className="space-y-4">
                <h3 className="font-bold text-gray-900 text-lg">Dados de acesso</h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <div className="relative">
                    <input
                      type="email"
                      value={email}
                      onChange={e => { setEmail(e.target.value); setEmailTaken(false); }}
                      onBlur={handleEmailBlur}
                      placeholder="clube@email.com"
                      className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 pr-10 ${
                        emailTaken
                          ? 'border-red-400 focus:ring-red-300 bg-red-50'
                          : 'border-gray-300 focus:ring-purple-500'
                      }`}
                    />
                    {checkingEmail && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">verificando...</span>
                    )}
                  </div>
                  {emailTaken && (
                    <p className="mt-1.5 text-sm text-red-600 font-medium">
                      Este email já está cadastrado. Faça login ou use outro email.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Senha *</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar senha *</label>
                  <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
              </div>
            )}

            {/* Step 2: Club info */}
            {step === 2 && (
              <div className="space-y-4">
                <h3 className="font-bold text-gray-900 text-lg">Informações do clube</h3>

                {/* Nome */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome do clube *</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Society dos Amigos"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>

                {/* Telefone */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefone *</label>
                  <div className="flex gap-2">
                    {/* DDI */}
                    <select
                      value={phoneDdi}
                      onChange={e => { setPhoneDdi(e.target.value); setPhoneNumber(''); }}
                      className="px-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white text-sm font-medium flex-shrink-0"
                    >
                      <option value="+55">🇧🇷 +55</option>
                      <option value="+353">🇮🇪 +353</option>
                    </select>
                    {/* DDD */}
                    <div className="relative w-20 flex-shrink-0">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">(</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={phoneDdd}
                        onChange={e => setPhoneDdd(formatDdd(e.target.value))}
                        placeholder="11"
                        className="w-full pl-5 pr-5 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-center"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">)</span>
                    </div>
                    {/* Number */}
                    <input
                      type="text"
                      inputMode="numeric"
                      value={phoneNumber}
                      onChange={e => setPhoneNumber(formatPhoneNumber(e.target.value, phoneDdi))}
                      placeholder={phoneDdi === '+55' ? '9 9999-9999' : '000 000 0000'}
                      className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>

                {/* CEP */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CEP *</label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={cep}
                      onChange={e => setCep(formatCep(e.target.value))}
                      onBlur={handleCepBlur}
                      placeholder="00000-000"
                      maxLength={9}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 pr-10"
                    />
                    {cepLoading && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">buscando...</span>
                    )}
                  </div>
                  {cepError && <p className="text-red-500 text-xs mt-1">{cepError}</p>}
                </div>

                {/* Rua + Número */}
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Rua *</label>
                    <input type="text" value={addressStreet} onChange={e => setAddressStreet(e.target.value)}
                      placeholder="Preenchido pelo CEP"
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                  <div className="w-24 flex-shrink-0">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Número *</label>
                    <input type="text" value={addressNumber} onChange={e => setAddressNumber(e.target.value)}
                      placeholder="123"
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                </div>

                {/* Bairro + Cidade (auto) */}
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Bairro</label>
                    <input type="text" value={addressNeighborhood} onChange={e => setAddressNeighborhood(e.target.value)}
                      placeholder="Preenchido pelo CEP"
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
                    <input type="text" value={city} onChange={e => setCity(e.target.value)}
                      placeholder="Preenchido pelo CEP"
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-gray-50" />
                  </div>
                </div>

                {/* Descrição */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    rows={3}
                    placeholder="Ex: Somos um clube com 2 quadras society e 1 futsal, localizado no coração do bairro. Oferecemos vestiário, estacionamento e lanchonete. Atendemos de segunda a domingo das 7h às 23h."
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none placeholder:text-gray-300 placeholder:text-xs"
                  />
                </div>
              </div>
            )}

            {/* Step 3: Photos + details */}
            {step === 3 && (
              <div className="space-y-5">
                <h3 className="font-bold text-gray-900 text-lg">Fotos e detalhes</h3>

                {/* Main photo */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Foto principal *</label>
                  <input ref={mainPhotoRef} type="file" accept="image/*" className="hidden" onChange={handleMainPhoto} />
                  {mainPhotoPreview ? (
                    <div className="relative rounded-xl overflow-hidden h-40">
                      <img src={mainPhotoPreview} className="w-full h-full object-cover" />
                      <button type="button" onClick={() => { setMainPhoto(null); setMainPhotoPreview(''); }}
                        className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => mainPhotoRef.current?.click()}
                      className="w-full h-40 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-2 hover:border-purple-400 hover:bg-purple-50 transition-all">
                      <Camera className="w-8 h-8 text-gray-400" />
                      <span className="text-sm text-gray-500">Clique para adicionar foto</span>
                    </button>
                  )}
                </div>

                {/* Extra photos */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fotos adicionais <span className="text-gray-400 font-normal">({extraPhotos.length}/3)</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {extraPreviews.map((src, i) => (
                      <div key={i} className="relative rounded-xl overflow-hidden h-24">
                        <img src={src} className="w-full h-full object-cover" />
                        <button type="button" onClick={() => removeExtraPhoto(i)}
                          className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-0.5">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {extraPhotos.length < 3 && (
                      <button type="button" onClick={() => extraPhotoRef.current?.click()}
                        className="h-24 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-1 hover:border-purple-400 hover:bg-purple-50 transition-all">
                        <Upload className="w-5 h-5 text-gray-400" />
                        <span className="text-xs text-gray-400">Adicionar</span>
                      </button>
                    )}
                  </div>
                  <input ref={extraPhotoRef} type="file" accept="image/*" multiple className="hidden" onChange={handleExtraPhoto} />
                </div>

                {/* Courts */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Quadras * <span className="text-gray-400 font-normal">({courts.length}/3)</span>
                    </label>
                    {courts.length < 3 && (
                      <button type="button" onClick={addCourt}
                        className="text-sm font-semibold text-purple-600 hover:text-purple-700">
                        + Adicionar quadra
                      </button>
                    )}
                  </div>
                  <div className="space-y-3">
                    {courts.map((court, idx) => (
                      <div key={idx} className="border-2 border-gray-200 rounded-xl p-4 space-y-3 relative">
                        {courts.length > 1 && (
                          <button type="button" onClick={() => removeCourt(idx)}
                            className="absolute top-3 right-3 p-1 text-gray-400 hover:text-red-500 transition-colors">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                        <div className="text-xs font-semibold text-purple-600 uppercase tracking-wide">
                          Quadra {idx + 1}
                        </div>
                        {/* Name */}
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Nome da quadra *</label>
                          <input
                            type="text"
                            value={court.name}
                            onChange={e => updateCourt(idx, 'name', e.target.value)}
                            placeholder="Ex: Quadra Society 1"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                          />
                        </div>
                        {/* Type + Price */}
                        <div className="flex gap-3">
                          <div className="flex-1">
                            <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
                            <select
                              value={court.sportType}
                              onChange={e => updateCourt(idx, 'sportType', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm bg-white"
                            >
                              {COURT_TYPES.map(ct => (
                                <option key={ct.id} value={ct.id}>{ct.label}</option>
                              ))}
                            </select>
                          </div>
                          <div className="w-32">
                            <label className="block text-xs font-medium text-gray-600 mb-1">Preço/hora (R$)</label>
                            <input
                              type="number"
                              value={court.pricePerHour}
                              onChange={e => updateCourt(idx, 'pricePerHour', e.target.value)}
                              min="0"
                              step="10"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Amenities */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Comodidades disponíveis</label>
                  <div className="flex flex-wrap gap-2">
                    {AMENITIES.map(a => (
                      <button key={a} type="button" onClick={() => toggleAmenity(a)}
                        className={`px-3 py-2 rounded-full text-sm font-medium border-2 transition-all ${
                          amenities.includes(a) ? 'border-purple-600 bg-purple-600 text-white' : 'border-gray-200 text-gray-700 hover:border-gray-300'
                        }`}>
                        {amenities.includes(a) && <Check className="w-3 h-3 inline mr-1" />}
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {signupError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-600 text-sm">{signupError}</p>
              </div>
            )}

            {/* Navigation buttons */}
            <div className="flex gap-3 mt-6">
              {step > 1 && (
                <button type="button" onClick={() => { setStep(s => s - 1); setSignupError(''); }}
                  className="flex items-center gap-2 px-5 py-3 border-2 border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-colors">
                  <ChevronLeft className="w-4 h-4" /> Voltar
                </button>
              )}
              {step < 3 ? (
                <button type="button" onClick={nextStep} disabled={signupLoading || checkingEmail || emailTaken}
                  className="flex-1 flex items-center justify-center gap-2 bg-purple-600 text-white py-3 rounded-xl font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50">
                  {signupLoading || checkingEmail ? 'Verificando...' : <> Próximo <ChevronRight className="w-4 h-4" /></>}
                </button>
              ) : (
                <button type="button" onClick={handleSignup} disabled={signupLoading}
                  className="flex-1 bg-purple-600 text-white py-3 rounded-xl font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50">
                  {signupLoading ? 'Criando conta...' : 'Criar conta'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
