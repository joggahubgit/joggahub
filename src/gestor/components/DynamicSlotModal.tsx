import { useState, useEffect, useRef } from 'react';
import {
  X, ChevronLeft, CalendarCheck, Ban, Search, Loader2,
  DollarSign, Lock, Users, CheckCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase-gestor';

interface Profile { id: string; name: string; phone: string; }

interface Props {
  courtId: string;
  courtName: string;
  date: Date;
  hour: string;           // "09:00"
  pricePerHour: number;
  existingSlotId?: string; // set when slot record already exists (e.g. after cancelled booking)
  existingEndHour?: string; // end time of the existing slot, e.g. "23:30"
  onClose: () => void;
  onRefresh: () => void;
}

type View = 'choose' | 'reserve' | 'success';
type ReserveType = 'private' | 'open';

function isoDate(d: Date) {
  return d.toISOString().split('T')[0];
}

function addMinutesToHour(hour: string, minutes: number): string {
  const [h, m] = hour.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function buildISO(date: Date, time: string): string {
  return `${isoDate(date)}T${time}:00`;
}

export function DynamicSlotModal({ courtId, courtName, date, hour, pricePerHour, existingSlotId, existingEndHour, onClose, onRefresh }: Props) {
  const [view, setView] = useState<View>('choose');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [successType, setSuccessType] = useState<'reserve' | 'block'>('reserve');

  // Reserve form
  const [duration, setDuration] = useState<90 | 120>(90);
  const [reserveType, setReserveType] = useState<ReserveType>('private');
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [price, setPrice] = useState('');
  const [pricePerPlayer, setPricePerPlayer] = useState('');
  const [maxPlayers, setMaxPlayers] = useState('18');
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When an existing slot is reused, end time is fixed; otherwise compute from duration
  const endHour = existingSlotId && existingEndHour ? existingEndHour : addMinutesToHour(hour, duration);
  const durationMinutes = existingSlotId && existingEndHour
    ? (() => { const [h, m] = existingEndHour.split(':').map(Number); const [sh, sm] = hour.split(':').map(Number); return (h * 60 + m) - (sh * 60 + sm); })()
    : duration;
  const autoPrice = (pricePerHour * (durationMinutes / 60)).toFixed(0);

  // Auto-fill price when duration changes
  useEffect(() => {
    setPrice(autoPrice);
  }, [duration, pricePerHour]);

  useEffect(() => {
    if (search.length < 2) { setSearchResults([]); return; }
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(async () => {
      setSearching(true);
      const { data } = await supabase
        .from('profiles')
        .select('id, name, phone')
        .or(`name.ilike.%${search}%,phone.ilike.%${search}%`)
        .limit(8);
      setSearchResults(data ?? []);
      setSearching(false);
    }, 300);
    return () => { if (searchRef.current) clearTimeout(searchRef.current); };
  }, [search]);

  const dateLabel = date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  async function handleBlock() {
    setBusy(true); setError('');

    const body = existingSlotId
      ? { type: 'block', slotId: existingSlotId }
      : { type: 'block', courtId, startTime: buildISO(date, hour), endTime: buildISO(date, addMinutesToHour(hour, 30)) };

    const { error: fnErr } = await supabase.functions.invoke('create-manual-booking', { body });

    setBusy(false);
    if (fnErr) {
      const parsed = await (fnErr as any).context?.json?.().catch(() => null);
      setError(parsed?.error ?? fnErr.message ?? 'Erro ao bloquear');
      return;
    }
    setSuccessType('block');
    setView('success');
    onRefresh();
  }

  async function handleReserve() {
    setBusy(true); setError('');

    const startTime = buildISO(date, hour);
    const endTime = buildISO(date, endHour);

    let body: Record<string, unknown>;

    if (reserveType === 'private') {
      if (!selectedUser) { setError('Selecione um jogador.'); setBusy(false); return; }
      body = existingSlotId
        ? { type: 'private', slotId: existingSlotId, userId: selectedUser.id, price: parseFloat(price) || 0 }
        : { type: 'private', courtId, startTime, endTime, userId: selectedUser.id, price: parseFloat(price) || 0 };
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError('Sessão expirada. Faça login novamente.'); setBusy(false); return; }
      body = existingSlotId
        ? { type: 'open', slotId: existingSlotId, organizerId: user.id, maxPlayers: parseInt(maxPlayers) || 18, pricePerPlayer: parseFloat(pricePerPlayer) || 0 }
        : { type: 'open', courtId, startTime, endTime, organizerId: user.id, maxPlayers: parseInt(maxPlayers) || 18, pricePerPlayer: parseFloat(pricePerPlayer) || 0 };
    }

    const { error: fnErr } = await supabase.functions.invoke('create-manual-booking', { body });
    setBusy(false);
    if (fnErr) {
      const parsed = await (fnErr as any).context?.json?.().catch(() => null);
      setError(parsed?.error ?? fnErr.message ?? 'Erro ao criar reserva');
      return;
    }
    setSuccessType('reserve');
    setView('success');
    onRefresh();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl max-h-[92vh] overflow-y-auto">

        {/* Header */}
        <div className="bg-green-600 text-white px-6 pt-6 pb-5 rounded-t-3xl sm:rounded-t-2xl">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2">
              {view === 'reserve' && (
                <button onClick={() => { setView('choose'); setError(''); }}
                  className="p-1.5 hover:bg-white/20 rounded-lg transition-colors mr-1">
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              <span className="text-xs font-bold uppercase tracking-widest opacity-75">
                {view === 'reserve' ? 'Fazer Reserva' : view === 'success' ? (successType === 'block' ? 'Bloqueado' : 'Reserva criada') : 'Horário disponível'}
              </span>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-xl font-bold">{courtName}</p>
          <p className="text-sm opacity-80 mt-0.5 capitalize">{capFirst(dateLabel)}</p>
          <div className="flex items-center gap-2 mt-2">
            <span className="bg-white/20 rounded-lg px-3 py-1 text-sm font-semibold">
              {hour}{view === 'reserve' ? ` – ${endHour}` : ''}
            </span>
            {pricePerHour > 0 && (
              <span className="bg-white/20 rounded-lg px-3 py-1 text-sm font-semibold opacity-80">
                R$ {pricePerHour}/h
              </span>
            )}
          </div>
        </div>

        <div className="p-5">

          {/* ── CHOOSE ── */}
          {view === 'choose' && (
            <div className="space-y-3">
              <button
                onClick={() => { setView('reserve'); setError(''); }}
                className="w-full flex items-center gap-4 p-4 rounded-2xl bg-purple-600 text-white hover:bg-purple-700 transition-colors text-left"
              >
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <CalendarCheck className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold">Reservar manualmente</p>
                  <p className="text-sm opacity-80">Para um jogador cadastrado ou criar partida aberta</p>
                </div>
              </button>

              <button
                onClick={handleBlock}
                disabled={busy}
                className="w-full flex items-center gap-4 p-4 rounded-2xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors text-left disabled:opacity-60"
              >
                <div className="w-10 h-10 bg-gray-200 rounded-xl flex items-center justify-center flex-shrink-0">
                  {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Ban className="w-5 h-5" />}
                </div>
                <div>
                  <p className="font-bold">Bloquear horário</p>
                  <p className="text-sm text-gray-500">Impede reservas neste slot de 30 min</p>
                </div>
              </button>

              {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2 border border-red-100">{error}</p>}
            </div>
          )}

          {/* ── RESERVE ── */}
          {view === 'reserve' && (
            <div className="space-y-4">

              {/* Duration — hidden when reusing an existing slot (end time is fixed) */}
              {!existingSlotId && (
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Duração</label>
                  <div className="flex gap-2">
                    {([90, 120] as const).map(d => (
                      <button
                        key={d}
                        onClick={() => setDuration(d)}
                        className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                          duration === d
                            ? 'bg-purple-600 text-white border-purple-600'
                            : 'border-gray-200 text-gray-600 hover:border-purple-300'
                        }`}
                      >
                        {d === 90 ? '1h 30min' : '2h 00min'}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">{hour} – {endHour}</p>
                </div>
              )}
              {existingSlotId && (
                <p className="text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2">
                  Horário fixo: {hour} – {endHour}
                </p>
              )}

              {/* Type */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Tipo</label>
                <div className="flex gap-2">
                  <button onClick={() => setReserveType('private')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                      reserveType === 'private' ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-200 text-gray-600 hover:border-purple-300'
                    }`}>
                    <Lock className="w-4 h-4" /> Privada
                  </button>
                  <button onClick={() => setReserveType('open')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                      reserveType === 'open' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:border-blue-300'
                    }`}>
                    <Users className="w-4 h-4" /> Aberta
                  </button>
                </div>
              </div>

              {/* Private fields */}
              {reserveType === 'private' && (
                <>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Buscar jogador</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        autoFocus
                        type="text"
                        placeholder="Nome ou telefone..."
                        value={search}
                        onChange={e => { setSearch(e.target.value); setSelectedUser(null); }}
                        className="w-full pl-9 pr-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400"
                      />
                      {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />}
                    </div>
                    {!selectedUser && searchResults.length > 0 && (
                      <div className="mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                        {searchResults.map(p => (
                          <button key={p.id}
                            onClick={() => { setSelectedUser(p); setSearch(''); setSearchResults([]); }}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-purple-50 transition-colors border-b border-gray-100 last:border-0 text-left">
                            <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                              <span className="text-purple-700 font-bold text-sm">{p.name?.[0]?.toUpperCase()}</span>
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-900 text-sm truncate">{p.name}</p>
                              <p className="text-xs text-gray-500">{p.phone}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {!selectedUser && search.length >= 2 && !searching && searchResults.length === 0 && (
                      <p className="mt-2 text-sm text-gray-400 text-center">Nenhum jogador encontrado</p>
                    )}
                  </div>

                  {selectedUser && (
                    <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-xl border border-purple-200">
                      <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-bold">{selectedUser.name?.[0]?.toUpperCase()}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-gray-900 text-sm">{selectedUser.name}</p>
                        <p className="text-xs text-gray-500">{selectedUser.phone}</p>
                      </div>
                      <button onClick={() => setSelectedUser(null)} className="p-1.5 hover:bg-purple-100 rounded-lg transition-colors">
                        <X className="w-4 h-4 text-gray-500" />
                      </button>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                      Valor cobrado (R$)
                      <span className="text-xs font-normal text-gray-400 ml-2">
                        Sugerido: R$ {autoPrice}
                      </span>
                    </label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="number" min="0" step="5"
                        value={price}
                        onChange={e => setPrice(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Open game fields */}
              {reserveType === 'open' && (
                <>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Máximo de jogadores</label>
                    <input
                      type="number" min="2" max="22" step="1"
                      value={maxPlayers}
                      onChange={e => setMaxPlayers(e.target.value)}
                      className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Preço por jogador (R$)</label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="number" min="0" step="5"
                        value={pricePerPlayer}
                        onChange={e => setPricePerPlayer(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400"
                      />
                    </div>
                  </div>
                </>
              )}

              {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2 border border-red-100">{error}</p>}

              <button
                onClick={handleReserve}
                disabled={busy || (reserveType === 'private' && !selectedUser)}
                className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-white font-semibold transition-colors disabled:opacity-50 ${
                  reserveType === 'open' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-purple-600 hover:bg-purple-700'
                }`}
              >
                {busy
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <CalendarCheck className="w-5 h-5" />}
                {reserveType === 'open' ? 'Criar partida aberta' : 'Confirmar reserva'}
              </button>
            </div>
          )}

          {/* ── SUCCESS ── */}
          {view === 'success' && (
            <div className="text-center space-y-4">
              <div className="bg-green-50 rounded-2xl p-6 border border-green-100">
                <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                <p className="text-lg font-bold text-green-800">
                  {successType === 'block' ? 'Horário bloqueado' : 'Reserva criada'}
                </p>
                <p className="text-sm text-green-700 mt-1">
                  {successType === 'block'
                    ? `${hour} de ${capFirst(dateLabel)} bloqueado com sucesso.`
                    : `${hour} – ${endHour} de ${capFirst(dateLabel)} reservado.`}
                </p>
              </div>
              <button onClick={onClose}
                className="w-full py-3.5 rounded-2xl bg-gray-900 text-white font-bold hover:bg-gray-800 transition-colors">
                Fechar
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
