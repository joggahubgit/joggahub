import { useState, useEffect } from 'react';
import {
  Building2, MapPin, Phone, Mail, AlignLeft, Clock, Save, CheckCircle,
  Plus, Edit2, X, Calendar, ToggleLeft, ToggleRight, Loader2, ChevronRight, DollarSign,
} from 'lucide-react';
import { supabase } from '@/lib/supabase-gestor';
import { CreateSchedule } from './CreateSchedule';

interface Court {
  id: string;
  name: string;
  surface: string;
  price_per_hour: number;
  is_active: boolean;
}

interface Props {
  venueId: string | null;
  userId?: string;
  onVenueCreated: (venue: any) => void;
}

const SURFACES = ['Grama sintética', 'Grama natural', 'Piso emborrachado', 'Cimento', 'Salão', 'Saibro', 'Asfalto'];

export function SimpleSettings({ venueId, onVenueCreated }: Props) {
  // Venue form
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('São Paulo');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [description, setDescription] = useState('');
  const [openingHours, setOpeningHours] = useState('Seg-Dom: 08h-23h');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [venueError, setVenueError] = useState('');

  // Courts
  const [courts, setCourts] = useState<Court[]>([]);
  const [courtsLoading, setCourtsLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editSurface, setEditSurface] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [savingCourt, setSavingCourt] = useState(false);
  const [showAddCourt, setShowAddCourt] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSurface, setNewSurface] = useState('Grama sintética');
  const [newPrice, setNewPrice] = useState('120');
  const [addingCourt, setAddingCourt] = useState(false);
  const [scheduleCourtId, setScheduleCourtId] = useState<string | null>(null);

  // First-venue court fields
  const [courtName, setCourtName] = useState('Quadra 1');
  const [surface, setSurface] = useState('Grama sintética');
  const [pricePerHour, setPricePerHour] = useState('120');

  useEffect(() => {
    if (!venueId) return;
    supabase.from('venues').select('*').eq('id', venueId).single().then(({ data }) => {
      if (data) {
        setName(data.name || '');
        setAddress(data.address || '');
        setCity(data.city || '');
        setPhone(data.phone || '');
        setEmail(data.email || '');
        setDescription(data.description || '');
        setOpeningHours(data.opening_hours || '');
      }
    });
    fetchCourts();
  }, [venueId]);

  async function fetchCourts() {
    if (!venueId) return;
    setCourtsLoading(true);
    const { data } = await supabase
      .from('courts')
      .select('id, name, surface, price_per_hour, is_active')
      .eq('venue_id', venueId)
      .order('name');
    setCourts(data ?? []);
    setCourtsLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setVenueError('');
    const venueData = { name, address, city, phone, email, description, opening_hours: openingHours };

    if (venueId) {
      const { error } = await supabase.from('venues').update(venueData).eq('id', venueId);
      if (error) { setVenueError(error.message); setSaving(false); return; }
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: venue, error } = await supabase
        .from('venues').insert({ ...venueData, admin_id: user?.id }).select().single();
      if (error) { setVenueError(error.message); setSaving(false); return; }
      if (venue) {
        await supabase.from('courts').insert({
          venue_id: venue.id, name: courtName, surface,
          price_per_hour: Number(pricePerHour), sport_type: 'football', is_active: true,
        });
        onVenueCreated(venue);
      }
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  function startEdit(court: Court) {
    setEditingId(court.id);
    setEditName(court.name);
    setEditSurface(court.surface || 'Grama sintética');
    setEditPrice(String(court.price_per_hour));
  }

  async function saveEdit() {
    if (!editingId) return;
    setSavingCourt(true);
    await supabase.from('courts').update({
      name: editName,
      surface: editSurface,
      price_per_hour: Number(editPrice) || 0,
    }).eq('id', editingId);
    setSavingCourt(false);
    setEditingId(null);
    fetchCourts();
  }

  async function toggleActive(court: Court) {
    await supabase.from('courts').update({ is_active: !court.is_active }).eq('id', court.id);
    fetchCourts();
  }

  async function addCourt() {
    if (!venueId || !newName.trim()) return;
    setAddingCourt(true);
    await supabase.from('courts').insert({
      venue_id: venueId, name: newName.trim(), surface: newSurface,
      price_per_hour: Number(newPrice) || 0, sport_type: 'football', is_active: true,
    });
    setAddingCourt(false);
    setShowAddCourt(false);
    setNewName('');
    fetchCourts();
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900">Configurações</h2>
        <p className="text-gray-500 mt-1 text-sm">Gerencie as informações do seu complexo e quadras</p>
      </div>

      {/* ── Venue form ── */}
      <form onSubmit={handleSubmit}>
        <div className="bg-white rounded-2xl border-2 border-gray-100 overflow-hidden shadow-sm">
          {/* Section header */}
          <div className="px-6 py-4 border-b-2 border-gray-100 flex items-center gap-3">
            <div className="w-9 h-9 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Building2 className="w-4.5 h-4.5 text-purple-600" style={{ width: 18, height: 18 }} />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Informações do Complexo</h3>
              <p className="text-xs text-gray-400">Visíveis para os jogadores no app</p>
            </div>
          </div>

          <div className="p-6 space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Nome do Complexo *</label>
              <input
                type="text" value={name} onChange={e => setName(e.target.value)} required
                placeholder="Arena JoggaHub São Paulo"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors"
              />
            </div>

            {/* Address + City */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                <span className="inline-flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />Endereço *</span>
              </label>
              <input
                type="text" value={address} onChange={e => setAddress(e.target.value)} required
                placeholder="Rua das Flores, 123 — Bairro"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Cidade</label>
                <input
                  type="text" value={city} onChange={e => setCity(e.target.value)}
                  placeholder="São Paulo"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  <span className="inline-flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />Horário de Funcionamento</span>
                </label>
                <input
                  type="text" value={openingHours} onChange={e => setOpeningHours(e.target.value)}
                  placeholder="Seg-Dom: 08h–23h"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  <span className="inline-flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />Telefone</span>
                </label>
                <input
                  type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="(11) 99999-9999"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  <span className="inline-flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />Email de contato</span>
                </label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="contato@suaquadra.com"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                <span className="inline-flex items-center gap-1.5"><AlignLeft className="w-3.5 h-3.5" />Descrição</span>
              </label>
              <textarea
                value={description} onChange={e => setDescription(e.target.value)} rows={3}
                placeholder="Descreva seu complexo esportivo — estrutura, diferenciais, estacionamento..."
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors resize-none"
              />
            </div>

            {/* First court (only shown when creating) */}
            {!venueId && (
              <div className="border-t-2 border-gray-100 pt-5">
                <p className="text-sm font-bold text-gray-700 mb-3">Primeira Quadra</p>
                <div className="space-y-3">
                  <input
                    type="text" value={courtName} onChange={e => setCourtName(e.target.value)}
                    placeholder="Nome da quadra"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <select value={surface} onChange={e => setSurface(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors">
                      {SURFACES.map(s => <option key={s}>{s}</option>)}
                    </select>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">R$</span>
                      <input type="number" value={pricePerHour} onChange={e => setPricePerHour(e.target.value)} min={0} step={10}
                        placeholder="120"
                        className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {venueError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{venueError}</p>
            )}
          </div>

          <div className="px-6 py-4 border-t-2 border-gray-100 bg-gray-50 flex justify-end">
            <button
              type="submit" disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50"
            >
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
                : saved
                ? <><CheckCircle className="w-4 h-4" /> Salvo!</>
                : <><Save className="w-4 h-4" /> {venueId ? 'Salvar alterações' : 'Cadastrar'}</>}
            </button>
          </div>
        </div>
      </form>

      {/* ── Courts section (only when venue exists) ── */}
      {venueId && (
        <div className="bg-white rounded-2xl border-2 border-gray-100 overflow-hidden shadow-sm">
          {/* Section header */}
          <div className="px-6 py-4 border-b-2 border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Calendar className="w-4.5 h-4.5 text-blue-600" style={{ width: 18, height: 18 }} />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Quadras</h3>
                <p className="text-xs text-gray-400">{courts.filter(c => c.is_active).length} ativa{courts.filter(c => c.is_active).length !== 1 ? 's' : ''} · {courts.length} total</p>
              </div>
            </div>
            <button
              onClick={() => { setShowAddCourt(true); setNewName(`Quadra ${courts.length + 1}`); }}
              className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 text-white rounded-xl font-semibold text-sm hover:bg-purple-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> Adicionar
            </button>
          </div>

          {courtsLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : courts.length === 0 ? (
            <div className="px-6 py-10 text-center text-gray-400">
              <p className="text-sm font-medium">Nenhuma quadra cadastrada</p>
              <p className="text-xs mt-1">Clique em "Adicionar" para criar sua primeira quadra.</p>
            </div>
          ) : (
            <div className="divide-y-2 divide-gray-100">
              {courts.map(court => (
                <div key={court.id}>
                  {editingId === court.id ? (
                    /* Edit inline */
                    <div className="p-4 bg-purple-50/40 space-y-3">
                      <input
                        type="text" value={editName} onChange={e => setEditName(e.target.value)}
                        className="w-full px-3 py-2.5 border-2 border-purple-300 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
                        autoFocus
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <select value={editSurface} onChange={e => setEditSurface(e.target.value)}
                          className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400">
                          {SURFACES.map(s => <option key={s}>{s}</option>)}
                        </select>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">R$</span>
                          <input type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)} min={0} step={10}
                            className="w-full pl-9 pr-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setEditingId(null)} disabled={savingCourt}
                          className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 disabled:opacity-50">
                          Cancelar
                        </button>
                        <button onClick={saveEdit} disabled={savingCourt || !editName.trim()}
                          className="flex-1 py-2.5 rounded-xl bg-purple-600 text-white font-bold text-sm hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                          {savingCourt ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                          Salvar
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Display row */
                    <div className={`px-5 py-4 flex items-center gap-4 transition-colors ${!court.is_active ? 'opacity-50' : ''}`}>
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 font-bold text-gray-500 text-sm">
                        {court.name.replace(/\D/g, '') || court.name[0]?.toUpperCase() || '?'}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 truncate">{court.name}</p>
                        <p className="text-xs text-gray-500 flex items-center gap-2 mt-0.5 flex-wrap">
                          <span>{court.surface || '—'}</span>
                          <span className="text-gray-300">·</span>
                          <span className="flex items-center gap-0.5">
                            <DollarSign className="w-3 h-3" />
                            R$ {court.price_per_hour}/h
                          </span>
                          {!court.is_active && <span className="text-amber-500 font-semibold">Inativa</span>}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {/* Schedule */}
                        <button
                          onClick={() => setScheduleCourtId(court.id)}
                          title="Configurar horários"
                          className="p-2 rounded-xl text-gray-400 hover:bg-purple-50 hover:text-purple-600 transition-colors"
                        >
                          <Calendar className="w-4 h-4" />
                        </button>

                        {/* Edit */}
                        <button
                          onClick={() => startEdit(court)}
                          title="Editar quadra"
                          className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        {/* Toggle active */}
                        <button
                          onClick={() => toggleActive(court)}
                          title={court.is_active ? 'Desativar quadra' : 'Ativar quadra'}
                          className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 transition-colors"
                        >
                          {court.is_active
                            ? <ToggleRight className="w-5 h-5 text-green-500" />
                            : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Add court inline form */}
              {showAddCourt && (
                <div className="p-4 bg-green-50/40 border-t-2 border-green-100 space-y-3">
                  <p className="text-sm font-bold text-gray-700">Nova quadra</p>
                  <input
                    type="text" value={newName} onChange={e => setNewName(e.target.value)}
                    placeholder="Nome da quadra"
                    className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    autoFocus
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <select value={newSurface} onChange={e => setNewSurface(e.target.value)}
                      className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
                      {SURFACES.map(s => <option key={s}>{s}</option>)}
                    </select>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">R$</span>
                      <input type="number" value={newPrice} onChange={e => setNewPrice(e.target.value)} min={0} step={10}
                        className="w-full pl-9 pr-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setShowAddCourt(false)}
                      className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50">
                      Cancelar
                    </button>
                    <button onClick={addCourt} disabled={addingCourt || !newName.trim()}
                      className="flex-1 py-2.5 rounded-xl bg-green-600 text-white font-bold text-sm hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                      {addingCourt ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      Adicionar quadra
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Schedule tip */}
          {courts.length > 0 && (
            <div className="px-5 py-3 border-t-2 border-gray-100 bg-gray-50 flex items-center gap-2 text-xs text-gray-400">
              <Calendar className="w-3.5 h-3.5" />
              Clique em <Calendar className="w-3 h-3 text-purple-500 inline-block mx-0.5" /> para configurar os horários de funcionamento de cada quadra.
            </div>
          )}
        </div>
      )}

      {/* Schedule modal — scoped to a specific court if triggered from courts list */}
      {scheduleCourtId && venueId && (
        <CreateSchedule
          venueId={venueId}
          onClose={() => setScheduleCourtId(null)}
          onSaved={() => setScheduleCourtId(null)}
        />
      )}
    </div>
  );
}
