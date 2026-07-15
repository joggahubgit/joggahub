import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CreditCard, Calendar, MapPin, Users, Loader2, ShieldCheck, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '../contexts/AuthContext';

type GameRow = {
  scheduled_at: string | null;
  court_price: number | null;
  price_per_player: number | null;
  current_players: number;
  pay_mode: string | null;
  is_open: boolean;
  status: string;
  stripe_split_captured: boolean;
  courts: { name: string; venues: { name: string } | null } | null;
};

type PaymentEntry = {
  game_id: string;
  stripe_payment_intent_id: string | null;
  games: GameRow | null;
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
}

function formatTime(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function gameTypeLabel(g: GameRow | null) {
  if (!g) return 'Partida';
  if (g.is_open) return 'Partida Aberta';
  if (g.pay_mode === 'split') return 'Privada · Divisão';
  return 'Privada · Total';
}

function calcAmount(g: GameRow | null): number {
  if (!g) return 0;
  const cp = g.court_price ?? 0;
  if (cp <= 0) return Math.round(((g.price_per_player ?? 0) * 1.08 + 2.50) * 100) / 100;
  if (g.pay_mode === 'full') return Math.round((cp * 1.08 + 2.50) * 100) / 100;
  const N = Math.max(g.current_players, g.is_open ? 1 : 10);
  return Math.round(((cp / N) * 1.08 + 2.50) * 100) / 100;
}

function paymentStatus(g: GameRow | null): 'paid' | 'hold' | 'refunded' | 'released' {
  if (!g) return 'hold';
  if (g.status === 'cancelled' || g.status === 'expired') {
    // Money only actually moved if the hold had already been captured before cancellation.
    // Most cancellations happen before the capture cutoff, so the hold is just released — no charge, no refund.
    return g.stripe_split_captured ? 'refunded' : 'released';
  }
  if (g.stripe_split_captured) return 'paid';
  return 'hold';
}

export default function PaymentsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'history' | 'methods'>('history');
  const [entries, setEntries] = useState<PaymentEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('game_players')
      .select(`
        game_id,
        stripe_payment_intent_id,
        games!game_id (
          scheduled_at,
          court_price,
          price_per_player,
          current_players,
          pay_mode,
          is_open,
          status,
          stripe_split_captured,
          courts!court_id (
            name,
            venues!venue_id (
              name
            )
          )
        )
      `)
      .eq('player_id', user.id)
      .eq('paid', true)
      .limit(40)
      .then(({ data }) => {
        const sorted = ((data as unknown as PaymentEntry[]) ?? []).sort((a, b) => {
          const da = a.games?.scheduled_at ?? '';
          const db = b.games?.scheduled_at ?? '';
          return db.localeCompare(da);
        });
        setEntries(sorted);
        setLoading(false);
      });
  }, [user]);

  const now = new Date();
  const thisMonthEntries = entries.filter(e => {
    const s = e.games?.scheduled_at;
    if (!s) return false;
    const d = new Date(s);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  // Only count money that's actually committed right now (charged or on hold) —
  // released/refunded games shouldn't inflate "total comprometido".
  const committedThisMonth = thisMonthEntries.filter(e => {
    const s = paymentStatus(e.games);
    return s === 'paid' || s === 'hold';
  });
  const thisMonthTotal = committedThisMonth.reduce((sum, e) => sum + calcAmount(e.games), 0);
  const avgPerGame = committedThisMonth.length > 0 ? thisMonthTotal / committedThisMonth.length : 0;

  const statusBadge = (g: GameRow | null) => {
    const s = paymentStatus(g);
    if (s === 'paid') return <span className="px-2.5 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded-full">Pago</span>;
    if (s === 'hold') return <span className="px-2.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full">Bloqueado</span>;
    if (s === 'refunded') return <span className="px-2.5 py-0.5 bg-orange-100 text-orange-700 text-xs font-semibold rounded-full">Reembolsado</span>;
    return <span className="px-2.5 py-0.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded-full">Liberado</span>;
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-6">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-6 py-4 flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="text-gray-600 hover:text-gray-900"><ArrowLeft className="w-6 h-6" /></button>
          <h1 className="text-xl font-bold text-gray-900">Pagamentos</h1>
        </div>
        <div className="flex border-t border-gray-200">
          <button onClick={() => setActiveTab('history')} className={`flex-1 py-3 text-sm font-semibold transition-colors ${activeTab === 'history' ? 'text-violet-600 border-b-2 border-violet-600' : 'text-gray-500'}`}>Histórico</button>
          <button onClick={() => setActiveTab('methods')} className={`flex-1 py-3 text-sm font-semibold transition-colors ${activeTab === 'methods' ? 'text-violet-600 border-b-2 border-violet-600' : 'text-gray-500'}`}>Sobre pagamentos</button>
        </div>
      </div>

      {activeTab === 'history' && (
        <div className="px-6 py-6 space-y-4">
          <div className="bg-gradient-to-br from-violet-600 to-violet-700 rounded-2xl p-6 text-white shadow-lg">
            <p className="text-sm text-violet-100 mb-1">Total comprometido este mês</p>
            {loading ? (
              <Loader2 className="w-6 h-6 animate-spin my-2" />
            ) : (
              <>
                <h2 className="text-3xl font-bold mb-4">R$ {thisMonthTotal.toFixed(2)}</h2>
                <div className="flex gap-6 text-sm">
                  <div><p className="text-violet-100">Partidas</p><p className="font-semibold">{committedThisMonth.length}</p></div>
                  {committedThisMonth.length > 0 && (
                    <div><p className="text-violet-100">Média por partida</p><p className="font-semibold">R$ {avgPerGame.toFixed(2)}</p></div>
                  )}
                </div>
              </>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-violet-500" /></div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p className="font-medium text-gray-500">Nenhum pagamento encontrado</p>
              <p className="text-sm mt-1">Suas reservas e partidas aparecerão aqui</p>
            </div>
          ) : (
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-900 px-1">Transações</h3>
              {entries.map((entry) => {
                const g = entry.games;
                const amount = calcAmount(g);
                const status = paymentStatus(g);
                return (
                  <div key={entry.game_id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0 pr-3">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h4 className="font-semibold text-gray-900 truncate">{g?.courts?.name ?? '—'}</h4>
                          {statusBadge(g)}
                        </div>
                        {g?.courts?.venues?.name && (
                          <div className="flex items-center gap-1 text-sm text-gray-500 mb-1">
                            <MapPin className="w-3 h-3 flex-shrink-0" /><span className="truncate">{g.courts.venues.name}</span>
                          </div>
                        )}
                        {g?.scheduled_at && (
                          <div className="flex items-center gap-1 text-sm text-gray-500">
                            <Calendar className="w-3 h-3 flex-shrink-0" />
                            <span>{formatDate(g.scheduled_at)} às {formatTime(g.scheduled_at)}</span>
                          </div>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`text-lg font-bold ${status === 'refunded' ? 'text-orange-600' : status === 'released' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                          {status === 'refunded' ? '–' : ''}R$ {amount.toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-500">{gameTypeLabel(g)}</p>
                      </div>
                    </div>
                    <div className="pt-3 border-t border-gray-100 flex items-center gap-4">
                      {g && (
                        <div className="flex items-center gap-1 text-sm text-gray-500">
                          <Users className="w-4 h-4" /><span>{g.current_players} {g.current_players === 1 ? 'jogador' : 'jogadores'}</span>
                        </div>
                      )}
                      {status === 'hold' && (
                        <div className="flex items-center gap-1 text-sm text-blue-600">
                          <Clock className="w-4 h-4" /><span>Aguardando cobrança</span>
                        </div>
                      )}
                      {status === 'released' && (
                        <div className="flex items-center gap-1 text-sm text-gray-400">
                          <span>Bloqueio liberado, sem cobrança</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {entries.length > 0 && (
            <p className="text-center text-xs text-gray-400 pt-2">
              Valores estimados com base no número atual de jogadores. O valor final pode variar.
            </p>
          )}
        </div>
      )}

      {activeTab === 'methods' && (
        <div className="px-6 py-6 space-y-4">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-violet-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <ShieldCheck className="w-6 h-6 text-violet-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Pagamentos via Stripe</h3>
                <p className="text-sm text-gray-500">Seus dados nunca passam pelos nossos servidores</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              Todas as transações são processadas com segurança pelo Stripe. Seus dados de cartão são criptografados e armazenados diretamente pelo Stripe, nunca pelo JoggaHub.
            </p>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200 space-y-3">
            <h3 className="font-semibold text-gray-900">Como funciona o bloqueio</h3>
            <div className="space-y-3 text-sm text-gray-600">
              <div className="flex gap-3">
                <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-blue-700 text-xs font-bold">1</span>
                </div>
                <p>Ao se inscrever, reservamos o valor no seu cartão (bloqueio temporário — sem cobrança ainda).</p>
              </div>
              <div className="flex gap-3">
                <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-blue-700 text-xs font-bold">2</span>
                </div>
                <p>A cobrança efetiva ocorre quando a partida for confirmada: 24h antes (privada) ou 2h antes (aberta/split).</p>
              </div>
              <div className="flex gap-3">
                <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-blue-700 text-xs font-bold">3</span>
                </div>
                <p>Se a partida for cancelada antes da cobrança, o bloqueio é liberado sem nenhuma taxa.</p>
              </div>
            </div>
          </div>

          <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
            <p className="text-sm text-violet-900 leading-relaxed">
              <strong>Taxa de serviço:</strong> 8% + R$ 2,50 por transação, incluída no valor mostrado no momento da reserva.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
