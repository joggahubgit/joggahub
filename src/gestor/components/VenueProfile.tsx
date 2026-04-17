import { useState, useEffect, useRef } from 'react';
import { Save, MapPin, Phone, Mail, Check, X, Upload, Camera, Pencil, AlertCircle, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Props {
  venue: any;
  onVenueUpdated: (venue: any) => void;
}

const AMENITIES = ['Banheiro', 'Vestiário', 'Churrasqueira', 'Área para Festa', 'Estacionamento', 'Lanchonete', 'Iluminação'];
const SPORT_TYPES = [
  { id: 'society', label: 'Society' },
  { id: 'futsal', label: 'Futsal' },
];

async function uploadPhoto(file: File, venueId: string, index: number): Promise<string | null> {
  const ext = file.name.split('.').pop();
  const path = `${venueId}/${Date.now()}_${index}.${ext}`;
  const { error } = await supabase.storage.from('venue-photos').upload(path, file, { upsert: true });
  if (error) { console.error('Upload error:', error); return null; }
  const { data } = supabase.storage.from('venue-photos').getPublicUrl(path);
  return data.publicUrl;
}

/** Parse a stored phone like "+55 (11) 99999-9999" into parts */
function parsePhone(raw: string) {
  const ddiMatch = raw.match(/^(\+\d+)/);
  const dddMatch = raw.match(/\((\d{1,3})\)/);
  const numMatch = raw.replace(/^(\+\d+)\s*/, '').replace(/\(\d+\)\s*/, '');
  return {
    ddi: ddiMatch?.[1] ?? '+55',
    ddd: dddMatch?.[1] ?? '',
    number: numMatch.trim(),
  };
}

function formatDdd(v: string) { return v.replace(/\D/g, '').slice(0, 2); }
function formatPhoneNumber(v: string, ddi: string) {
  const d = v.replace(/\D/g, '');
  if (ddi === '+55') {
    const s = d.slice(0, 9);
    return s.length > 5 ? `${s.slice(0, 5)}-${s.slice(5)}` : s;
  }
  return d.slice(0, 10);
}
function formatCep(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export function VenueProfile({ venue, onVenueUpdated }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [courts, setCourts] = useState<any[]>([]);

  // ── Venue form fields ─────────────────────────────────────
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [description, setDescription] = useState('');

  // Phone parts
  const [phoneDdi, setPhoneDdi] = useState('+55');
  const [phoneDdd, setPhoneDdd] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const phone = phoneDdd ? `${phoneDdi} (${phoneDdd}) ${phoneNumber}` : `${phoneDdi} ${phoneNumber}`;

  // Address parts
  const [cep, setCep] = useState('');
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState('');
  const [addressStreet, setAddressStreet] = useState('');
  const [addressNumber, setAddressNumber] = useState('');
  const [addressNeighborhood, setAddressNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const address = [addressStreet, addressNumber, addressNeighborhood].filter(Boolean).join(', ');

  // ── Photos ────────────────────────────────────────────────
  const [images, setImages] = useState<string[]>([]);
  const [newPhotos, setNewPhotos] = useState<File[]>([]);
  const [newPreviews, setNewPreviews] = useState<string[]>([]);
  const photoRef = useRef<HTMLInputElement>(null);

  // ── Courts (editable list) ────────────────────────────────
  const [editCourts, setEditCourts] = useState<{ id?: string; name: string; sportType: string; pricePerHour: string; isNew?: boolean; toDelete?: boolean }[]>([]);

  // ── Amenities ─────────────────────────────────────────────
  const [amenities, setAmenities] = useState<string[]>([]);

  useEffect(() => {
    if (venue?.id) fetchCourts();
  }, [venue?.id]);

  async function fetchCourts() {
    const { data } = await supabase.from('courts').select('*').eq('venue_id', venue.id).neq('is_active', false);
    if (data?.length) {
      setCourts(data);
      const allImages = [...new Set(data.flatMap((c: any) => c.images ?? []))];
      const allAmenities = [...new Set(data.flatMap((c: any) => c.amenities ?? []))];
      setImages(allImages);
      setAmenities(allAmenities);
    } else {
      setCourts([]);
    }
  }

  // ── Missing field detection ───────────────────────────────
  const missingFields: string[] = [];
  if (!venue?.phone) missingFields.push('Telefone');
  if (!venue?.address) missingFields.push('Endereço');
  if (!venue?.description) missingFields.push('Descrição');
  if (courts.length === 0) missingFields.push('Quadras');

  // ── Start edit ────────────────────────────────────────────
  function startEdit() {
    setName(venue?.name ?? '');
    setEmail(venue?.email ?? '');
    setDescription(venue?.description ?? '');

    // Parse phone
    const parsed = parsePhone(venue?.phone ?? '');
    setPhoneDdi(parsed.ddi);
    setPhoneDdd(parsed.ddd);
    setPhoneNumber(parsed.number);

    // Address: best effort — put existing address in street field
    setAddressStreet(venue?.address ?? '');
    setAddressNumber('');
    setAddressNeighborhood('');
    setCity(venue?.city ?? '');
    setCep('');
    setCepError('');

    // Courts
    setEditCourts(courts.map(c => ({
      id: c.id,
      name: c.name ?? '',
      sportType: c.sport_type ?? 'society',
      pricePerHour: String(c.price_per_hour ?? 120),
    })));

    setNewPhotos([]);
    setNewPreviews([]);
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
    setNewPhotos([]);
    setNewPreviews([]);
    setCepError('');
  }

  // ── CEP lookup ────────────────────────────────────────────
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
      setCepError('Erro ao buscar CEP.');
    } finally {
      setCepLoading(false);
    }
  }

  // ── Photo handlers ────────────────────────────────────────
  function handlePhotoAdd(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const remaining = 4 - images.length - newPhotos.length;
    const toAdd = files.slice(0, remaining);
    setNewPhotos(prev => [...prev, ...toAdd]);
    setNewPreviews(prev => [...prev, ...toAdd.map(f => URL.createObjectURL(f))]);
  }
  function removeExistingPhoto(idx: number) { setImages(prev => prev.filter((_, i) => i !== idx)); }
  function removeNewPhoto(idx: number) {
    setNewPhotos(prev => prev.filter((_, i) => i !== idx));
    setNewPreviews(prev => prev.filter((_, i) => i !== idx));
  }

  // ── Court handlers ────────────────────────────────────────
  function addCourt() {
    if (editCourts.filter(c => !c.toDelete).length >= 3) return;
    setEditCourts(prev => [...prev, { name: '', sportType: 'society', pricePerHour: '120', isNew: true }]);
  }
  function updateCourt(idx: number, field: 'name' | 'sportType' | 'pricePerHour', value: string) {
    setEditCourts(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  }
  function markDeleteCourt(idx: number) {
    const c = editCourts[idx];
    if (c.isNew) {
      setEditCourts(prev => prev.filter((_, i) => i !== idx));
    } else {
      setEditCourts(prev => prev.map((ec, i) => i === idx ? { ...ec, toDelete: true } : ec));
    }
  }

  // ── Amenities ─────────────────────────────────────────────
  function toggleAmenity(a: string) {
    setAmenities(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);
  }

  // ── Save ──────────────────────────────────────────────────
  async function handleSave() {
    if (!venue?.id) return;
    setSaving(true);

    // Upload new photos
    const uploadedUrls: string[] = [];
    for (let i = 0; i < newPhotos.length; i++) {
      const url = await uploadPhoto(newPhotos[i], venue.id, images.length + i);
      if (url) uploadedUrls.push(url);
    }
    const finalImages = [...images, ...uploadedUrls];

    // Update venue
    const { data: updatedVenue, error: venueError } = await supabase
      .from('venues')
      .update({ name, email, phone, address, city, description })
      .eq('id', venue.id)
      .select().single();
    if (venueError) { console.error(venueError); setSaving(false); return; }

    // Process courts
    for (let i = 0; i < editCourts.length; i++) {
      const c = editCourts[i];
      if (c.toDelete && c.id) {
        await supabase.from('courts').update({ is_active: false }).eq('id', c.id);
      } else if (c.isNew) {
        await supabase.from('courts').insert({
          venue_id: venue.id,
          name: c.name.trim() || `Quadra ${i + 1}`,
          sport_type: c.sportType,
          is_active: true,
          price_per_hour: Number(c.pricePerHour) || 120,
          amenities,
          images: finalImages,
        });
      } else if (c.id) {
        await supabase.from('courts').update({
          name: c.name.trim(),
          sport_type: c.sportType,
          price_per_hour: Number(c.pricePerHour) || 120,
          amenities,
          images: finalImages,
        }).eq('id', c.id);
      }
    }

    setImages(finalImages);
    setNewPhotos([]);
    setNewPreviews([]);
    await fetchCourts();
    onVenueUpdated(updatedVenue);
    setIsEditing(false);
    setSaving(false);
  }

  const mainPhoto = images[0] ?? null;
  const initials = (venue?.name ?? 'JH').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
  const activeCourts = isEditing ? editCourts.filter(c => !c.toDelete) : courts;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Perfil do Clube</h1>
          <p className="text-gray-500 text-sm mt-1">Informações visíveis para os jogadores</p>
        </div>
        {!isEditing ? (
          <button onClick={startEdit}
            className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors font-semibold shadow-md text-sm">
            <Pencil className="w-4 h-4" /> Editar Perfil
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={cancelEdit}
              className="px-4 py-2.5 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 font-semibold text-sm">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 font-semibold shadow-md text-sm disabled:opacity-60">
              <Save className="w-4 h-4" />
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        )}
      </div>

      {/* Incomplete profile banner */}
      {missingFields.length > 0 && !isEditing && (
        <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-amber-800 text-sm">Perfil incompleto</p>
            <p className="text-amber-700 text-xs mt-0.5">
              Preencha os campos: <span className="font-medium">{missingFields.join(', ')}</span>
            </p>
          </div>
          <button onClick={startEdit}
            className="text-amber-800 font-semibold text-xs bg-amber-100 px-3 py-1.5 rounded-lg hover:bg-amber-200 transition-colors whitespace-nowrap">
            Completar agora
          </button>
        </div>
      )}

      {/* Hero card */}
      <div className="relative rounded-2xl overflow-hidden shadow-xl h-56 md:h-72">
        {mainPhoto ? (
          <img src={mainPhoto} alt={venue?.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-purple-600 to-purple-800" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
          <div className="flex items-end gap-4">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center font-bold text-2xl border-2 border-white/30 flex-shrink-0">
              {initials}
            </div>
            <div>
              <h2 className="text-2xl md:text-3xl font-bold">{venue?.name ?? 'Minha Quadra'}</h2>
              <div className="flex flex-wrap items-center gap-3 mt-1 text-white/80 text-sm">
                {venue?.address && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{venue.address}{venue.city ? `, ${venue.city}` : ''}</span>}
                {venue?.phone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{venue.phone}</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── LEFT: Basic info ── */}
        <div className="bg-white rounded-2xl border-2 border-gray-100 p-6 shadow-sm space-y-4">
          <h3 className="text-lg font-bold text-gray-900">Informações Básicas</h3>

          {isEditing ? (
            <div className="space-y-4">
              {/* Nome */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Clube</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none text-sm" />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none text-sm" />
              </div>

              {/* Telefone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                <div className="flex gap-2">
                  <select value={phoneDdi} onChange={e => { setPhoneDdi(e.target.value); setPhoneNumber(''); }}
                    className="px-2 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none bg-white text-sm flex-shrink-0">
                    <option value="+55">🇧🇷 +55</option>
                    <option value="+353">🇮🇪 +353</option>
                  </select>
                  <div className="relative w-20 flex-shrink-0">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">(</span>
                    <input type="text" inputMode="numeric" value={phoneDdd} onChange={e => setPhoneDdd(formatDdd(e.target.value))}
                      placeholder="11"
                      className="w-full pl-5 pr-4 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-sm text-center" />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">)</span>
                  </div>
                  <input type="text" inputMode="numeric" value={phoneNumber}
                    onChange={e => setPhoneNumber(formatPhoneNumber(e.target.value, phoneDdi))}
                    placeholder={phoneDdi === '+55' ? '9 9999-9999' : '000 000 0000'}
                    className="flex-1 px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-sm" />
                </div>
              </div>

              {/* CEP */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CEP</label>
                <div className="relative">
                  <input type="text" inputMode="numeric" value={cep}
                    onChange={e => setCep(formatCep(e.target.value))}
                    onBlur={handleCepBlur}
                    placeholder="00000-000" maxLength={9}
                    className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-sm pr-24" />
                  {cepLoading && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">buscando...</span>}
                </div>
                {cepError && <p className="text-red-500 text-xs mt-1">{cepError}</p>}
              </div>

              {/* Rua + Número */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rua</label>
                  <input type="text" value={addressStreet} onChange={e => setAddressStreet(e.target.value)}
                    placeholder="Preenchido pelo CEP"
                    className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-sm" />
                </div>
                <div className="w-24 flex-shrink-0">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Número</label>
                  <input type="text" value={addressNumber} onChange={e => setAddressNumber(e.target.value)}
                    placeholder="123"
                    className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-sm" />
                </div>
              </div>

              {/* Bairro + Cidade */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bairro</label>
                  <input type="text" value={addressNeighborhood} onChange={e => setAddressNeighborhood(e.target.value)}
                    placeholder="Preenchido pelo CEP"
                    className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-sm" />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
                  <input type="text" value={city} onChange={e => setCity(e.target.value)}
                    placeholder="Preenchido pelo CEP"
                    className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-sm bg-gray-50" />
                </div>
              </div>

              {/* Descrição */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
                  placeholder="Ex: Clube com 2 quadras society e 1 futsal, vestiário, estacionamento e lanchonete. Atendemos de segunda a domingo das 7h às 23h."
                  className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-sm resize-none placeholder:text-gray-300 placeholder:text-xs" />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {[
                { icon: <Mail className="w-4 h-4 text-purple-500" />, label: 'Email', value: venue?.email },
                { icon: <Phone className="w-4 h-4 text-purple-500" />, label: 'Telefone', value: venue?.phone },
                { icon: <MapPin className="w-4 h-4 text-purple-500" />, label: 'Endereço', value: venue?.address ? `${venue.address}${venue.city ? ', ' + venue.city : ''}` : null },
              ].map(({ icon, label, value }) => (
                <div key={label} className={`flex items-start gap-3 p-3 rounded-xl ${value ? 'bg-gray-50' : 'bg-amber-50 border border-amber-100'}`}>
                  <div className="mt-0.5">{icon}</div>
                  <div>
                    <p className="text-xs text-gray-500 font-medium">{label}</p>
                    {value
                      ? <p className="text-sm text-gray-900 font-semibold">{value}</p>
                      : <p className="text-xs text-amber-600 font-medium">Não preenchido</p>
                    }
                  </div>
                </div>
              ))}
              {venue?.description ? (
                <div className="p-3 bg-gray-50 rounded-xl">
                  <p className="text-xs text-gray-500 font-medium mb-1">Descrição</p>
                  <p className="text-sm text-gray-700">{venue.description}</p>
                </div>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl">
                  <p className="text-xs text-gray-500 font-medium">Descrição</p>
                  <p className="text-xs text-amber-600 font-medium mt-0.5">Não preenchida</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── RIGHT ── */}
        <div className="space-y-4">

          {/* Photos */}
          <div className="bg-white rounded-2xl border-2 border-gray-100 p-6 shadow-sm">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Fotos</h3>
            <input ref={photoRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoAdd} />
            <div className="grid grid-cols-3 gap-2">
              {images.map((src, i) => (
                <div key={i} className="relative rounded-xl overflow-hidden h-24 group">
                  <img src={src} className="w-full h-full object-cover" />
                  {i === 0 && <span className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded font-medium">Principal</span>}
                  {isEditing && (
                    <button onClick={() => removeExistingPhoto(i)}
                      className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
              {newPreviews.map((src, i) => (
                <div key={`new-${i}`} className="relative rounded-xl overflow-hidden h-24 group">
                  <img src={src} className="w-full h-full object-cover" />
                  <span className="absolute bottom-1 left-1 bg-purple-600/80 text-white text-xs px-1.5 py-0.5 rounded font-medium">Nova</span>
                  <button onClick={() => removeNewPhoto(i)}
                    className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {isEditing && (images.length + newPhotos.length) < 4 && (
                <button onClick={() => photoRef.current?.click()}
                  className="h-24 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-1 hover:border-purple-400 hover:bg-purple-50 transition-all">
                  <Upload className="w-5 h-5 text-gray-400" />
                  <span className="text-xs text-gray-400">Adicionar</span>
                </button>
              )}
              {!isEditing && images.length === 0 && (
                <div className="col-span-3 h-24 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-1">
                  <Camera className="w-6 h-6 text-gray-300" />
                  <span className="text-xs text-gray-400">Sem fotos</span>
                </div>
              )}
            </div>
          </div>

          {/* Courts */}
          <div className="bg-white rounded-2xl border-2 border-gray-100 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">
                Quadras <span className="text-sm font-normal text-gray-400">({activeCourts.length}/3)</span>
              </h3>
              {isEditing && activeCourts.length < 3 && (
                <button onClick={addCourt}
                  className="flex items-center gap-1 text-sm font-semibold text-purple-600 hover:text-purple-700">
                  <Plus className="w-4 h-4" /> Adicionar
                </button>
              )}
            </div>

            {isEditing ? (
              <div className="space-y-3">
                {editCourts.map((c, idx) => c.toDelete ? null : (
                  <div key={idx} className="border-2 border-gray-200 rounded-xl p-4 space-y-3 relative">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-purple-600 uppercase tracking-wide">Quadra {idx + 1}</span>
                      {activeCourts.length > 1 && (
                        <button onClick={() => markDeleteCourt(idx)}
                          className="text-gray-400 hover:text-red-500 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Nome</label>
                      <input type="text" value={c.name} onChange={e => updateCourt(idx, 'name', e.target.value)}
                        placeholder="Ex: Quadra Society 1"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm" />
                    </div>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
                        <select value={c.sportType} onChange={e => updateCourt(idx, 'sportType', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm bg-white">
                          {SPORT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                        </select>
                      </div>
                      <div className="w-32">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Preço/hora (R$)</label>
                        <input type="number" value={c.pricePerHour} onChange={e => updateCourt(idx, 'pricePerHour', e.target.value)}
                          min="0" step="10"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm" />
                      </div>
                    </div>
                  </div>
                ))}
                {activeCourts.length === 0 && (
                  <button onClick={addCourt}
                    className="w-full py-8 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center gap-2 text-gray-400 hover:border-purple-400 hover:text-purple-500 transition-all">
                    <Plus className="w-6 h-6" />
                    <span className="text-sm font-medium">Adicionar primeira quadra</span>
                  </button>
                )}
              </div>
            ) : courts.length === 0 ? (
              <div className="py-6 border-2 border-dashed border-amber-200 rounded-xl text-center bg-amber-50">
                <p className="text-sm text-amber-700 font-medium">Nenhuma quadra cadastrada</p>
                <button onClick={startEdit} className="mt-2 text-xs text-purple-600 font-semibold hover:underline">
                  Clique em Editar Perfil para adicionar
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {courts.map((c, i) => (
                  <div key={c.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{c.name}</p>
                      <p className="text-xs text-gray-500 capitalize mt-0.5">{c.sport_type}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-purple-600 text-sm">R$ {c.price_per_hour}/h</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Amenities */}
          <div className="bg-white rounded-2xl border-2 border-gray-100 p-6 shadow-sm">
            <h3 className="text-lg font-bold text-gray-900 mb-3">Comodidades</h3>
            <div className="flex flex-wrap gap-2">
              {AMENITIES.map(a => {
                const active = amenities.includes(a);
                return (
                  <button key={a} type="button"
                    onClick={() => isEditing && toggleAmenity(a)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border-2 transition-all ${
                      active ? 'border-purple-600 bg-purple-600 text-white' : 'border-gray-200 text-gray-500'
                    } ${isEditing ? 'cursor-pointer hover:border-purple-400' : 'cursor-default'}`}>
                    {active && <Check className="w-3 h-3 inline mr-1" />}
                    {a}
                  </button>
                );
              })}
            </div>
            {!isEditing && amenities.length === 0 && (
              <p className="text-sm text-gray-400 mt-2">Nenhuma comodidade cadastrada.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
