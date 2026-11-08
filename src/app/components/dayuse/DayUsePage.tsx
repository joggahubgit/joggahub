// Página da Partida aberta · Day use (jogador): quem já entrou, preço por pessoa,
// entrar pagando no app e sair com reembolso até 24h antes.
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Sun, MapPin, Clock, Users, CheckCircle, AlertTriangle, Info } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import BottomNav from '../BottomNav';
import { CLASS_ENROLL_CUTOFF_HOURS, classServiceFee, formatBRL, formatSessionDate } from '../../lib/classSchedule';
import { wallNowMs } from '../classes/ClassDetailPage';
import { SPORT_LABELS } from './dayUse';

export const DAY_USE_LEAVE_HOURS = 24;
const wallMs = (iso: string) => new Date(`${iso.substring(0, 19)}Z`).getTime();

interface DayUse {
  id: string; kind: string; title: string; description: string | null; sport_type: string;
  capacity: number; enrolled_count: number; price: number; status: string;
  venues: { name: string; city: string | null; address: string | null } | null;
  courts: { name: string } | null;
}
interface Player { player_id: string; name: string | null; avatar_url: string | null }
interface Enrollment { id: string; status: string; amount_paid: number; service_fee: number }

async function fnError(err: unknown, fallback: string) {
  try {
    const body = await (err as { context?: Response }).context?.json();
    if (body?.error) return body.error as string;
  } catch { /* ignore */ }
  return (err as Error)?.message ?? fallback;
}

export default function DayUsePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [du, setDu] = useState<DayUse | null>(null);
  const [session, setSession] = useState<{ starts_at: string; ends_at: string } | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [{ data: c }, { data: s }, { data: p }, { data: e }] = await Promise.all([
      supabase.from('classes')
        .select('id, kind, title, description, sport_type, capacity, enrolled_count, price, status, venues(name, city, address), courts(name)')
        .eq('id', id).maybeSingle(),
      supabase.from('class_sessions').select('starts_at, ends_at').eq('class_id', id).limit(1).maybeSingle(),
      supabase.rpc('day_use_players', { p_class_id: id }),
      user
        ? supabase.from('class_enrollments').select('id, status, amount_paid, service_fee')
            .eq('class_id', id).eq('player_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    setDu(c as unknown as DayUse);
    setSession(s ?? null);
    setPlayers((p as Player[]) ?? []);
    setEnrollment((e as Enrollment) ?? null);
    setLoading(false);
  }, [id, user]);

  useEffect(() => { load(); }, [load]);

  async function join() {
    if (!du) return;
    setBusy(true);
    setError('');
    const origin = window.location.origin;
    const { data, error: fnErr } = await supabase.functions.invoke('create-class-checkout-session', {
      body: { classId: du.id, successUrl: `${origin}/aulas/pagamento`, cancelUrl: `${origin}/day-use/${du.id}` },
    });
    if (fnErr || !data?.url) {
      setError(fnErr ? await fnError(fnErr, 'Não foi possível iniciar o pagamento.') : 'Não foi possível iniciar o pagamento.');
      setBusy(false);
      return;
    }
    window.location.href = data.url;
  }

  async function leave() {
    if (!enrollment) return;
    setBusy(true);
    setError('');
    const { data, error: fnErr } = await supabase.functions.invoke('leave-class', { body: { enrollmentId: enrollment.id } });
    setBusy(false);
    setConfirmLeave(false);
    if (fnErr) { setError(await fnError(fnErr, 'Não foi possível sair.')); return; }
    setNotice(data?.refunded ? 'Você saiu do day use. O valor total foi reembolsado no seu cartão.' : 'Você saiu do day use.');
    load();
  }

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">Carregando...</div>;
  if (!du || du.kind !== 'day_use' || !session) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <Sun className="w-12 h-12 text-gray-300" />
        <p className="text-gray-600 font-semibold">Day use não encontrado</p>
        <button onClick={() => navigate('/find-games')} className="text-violet-600 font-semibold">Ver jogos abertos</button>
        <BottomNav />
      </div>
    );
  }

  const joined = enrollment?.status === 'active';
  const cancelled = du.status !== 'active';
  const now = wallNowMs();
  const open = wallMs(session.starts_at) - CLASS_ENROLL_CUTOFF_HOURS * 3600_000 > now;
  const canLeave = wallMs(session.starts_at) - DAY_USE_LEAVE_HOURS * 3600_000 > now;
  const left = du.capacity - du.enrolled_count;
  const fee = classServiceFee(Number(du.price));
  const total = Number(du.price) + fee;
  const showBar = !joined && !cancelled;

  return (
    <div className={`min-h-screen bg-gray-50 ${showBar ? 'pb-56' : 'pb-24'}`}>
      <div className="bg-sky-600 text-white px-6 pt-6 pb-8 rounded-b-3xl">
        <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/home'))} aria-label="Voltar" className="mb-4"><ArrowLeft className="w-6 h-6" /></button>
        <p className="text-xs font-semibold uppercase tracking-wide text-sky-100 flex items-center gap-1"><Sun className="w-3.5 h-3.5" />Partida aberta · Day use</p>
        <h1 className="text-2xl font-bold mt-1">{du.title}</h1>
        <p className="text-sky-100 mt-1">{SPORT_LABELS[du.sport_type] ?? ''}{SPORT_LABELS[du.sport_type] ? ' · ' : ''}organizado pelo clube</p>
      </div>

      <div className="px-6 -mt-4 space-y-3">
        {cancelled && <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 text-sm">Este day use foi cancelado pelo clube.</div>}
        {notice && <div className="bg-green-50 border border-green-200 text-green-800 rounded-2xl p-4 text-sm flex gap-2"><CheckCircle className="w-4 h-4 mt-0.5" />{notice}</div>}
        {joined && (
          <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 flex gap-3">
            <CheckCircle className="w-5 h-5 text-sky-600 flex-shrink-0" />
            <div>
              <p className="font-semibold text-sky-900">Você está dentro!</p>
              <p className="text-sm text-sky-700">Pago {formatBRL(Number(enrollment!.amount_paid) + Number(enrollment!.service_fee))}. Bom jogo!</p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3 text-sm text-gray-700">
          <p className="flex items-start gap-3"><MapPin className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <span><b className="text-gray-900">{du.venues?.name}</b> · {du.courts?.name}{du.venues?.address ? <><br /><span className="text-gray-500">{du.venues.address}{du.venues.city ? `, ${du.venues.city}` : ''}</span></> : null}</span>
          </p>
          <p className="flex items-center gap-3"><Clock className="w-5 h-5 text-gray-400" />
            <span className="capitalize">{formatSessionDate(session.starts_at.substring(0, 10))}</span> · {session.starts_at.substring(11, 16)}–{session.ends_at.substring(11, 16)}
          </p>
          {du.description && <p className="pt-2 border-t border-gray-100 whitespace-pre-line text-gray-600">{du.description}</p>}
        </div>

        {/* Quem já entrou */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5"><Users className="w-4 h-4" />Jogadores</p>
            <p className="text-sm font-semibold text-gray-900">{du.enrolled_count}/{du.capacity}
              {!cancelled && <span className={`ml-2 text-xs font-bold px-2 py-0.5 rounded-full ${left > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>{left > 0 ? `${left} ${left === 1 ? 'vaga' : 'vagas'}` : 'Completo'}</span>}
            </p>
          </div>
          <div className="grid grid-cols-6 gap-3">
            {Array.from({ length: du.capacity }).map((_, i) => {
              const p = players[i];
              return (
                <div key={i} className="flex flex-col items-center gap-1 min-w-0">
                  <div className={`w-11 h-11 rounded-full overflow-hidden flex items-center justify-center ${p ? 'bg-sky-100 border-2 border-sky-300' : 'border-2 border-dashed border-gray-200'}`}>
                    {p?.avatar_url ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                      : p ? <span className="text-sky-700 font-bold">{(p.name ?? '?').charAt(0).toUpperCase()}</span> : null}
                  </div>
                  <span className="text-[10px] text-gray-500 truncate w-full text-center">{p ? (p.name ?? 'Jogador').split(' ')[0] : ''}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5 text-sm space-y-2">
          <p className="flex items-center gap-2 font-semibold text-gray-900"><Info className="w-4 h-4 text-sky-600" />Como funciona</p>
          <p className="text-gray-600">Jogo livre organizado pelo clube. Cada jogador paga {formatBRL(Number(du.price))} + taxa, na hora, pelo app.</p>
          <p className="text-gray-600">Desistiu? Reembolso total até {DAY_USE_LEAVE_HOURS}h antes do início. Se o clube cancelar, você recebe tudo de volta.</p>
          <p className="text-gray-600">As entradas fecham {CLASS_ENROLL_CUTOFF_HOURS}h antes do início. Não conta para o ranking.</p>
        </div>

        {joined && (
          !canLeave ? (
            <p className="text-xs text-gray-400 text-center">O prazo para sair com reembolso já passou. Fale com o clube.</p>
          ) : !confirmLeave ? (
            <button onClick={() => setConfirmLeave(true)} className="w-full py-3 text-sm font-semibold text-red-600">Sair do day use</button>
          ) : (
            <div className="bg-white border border-red-200 rounded-2xl p-4 space-y-3">
              <p className="flex gap-2 text-sm text-gray-700"><AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />Você perde a vaga e recebe o valor total de volta no cartão.</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmLeave(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700">Voltar</button>
                <button onClick={leave} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold disabled:opacity-60">{busy ? 'Saindo…' : 'Confirmar'}</button>
              </div>
            </div>
          )
        )}

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 text-sm">{error}</div>}
      </div>

      {showBar && (
        // Fica logo acima do menu de baixo
        <div className="fixed bottom-[69px] left-0 right-0 max-w-md mx-auto z-40 bg-white border-t border-gray-200 px-6 py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
          {left <= 0 ? (
            <p className="text-center text-sm font-semibold text-gray-500 py-2">Day use completo</p>
          ) : !open ? (
            <p className="text-center text-sm font-semibold text-gray-500 py-2">Entradas encerradas</p>
          ) : (
            <>
              <div className="flex items-baseline justify-between mb-2 text-sm">
                <span className="text-gray-500">{formatBRL(Number(du.price))} + taxa {formatBRL(fee)}</span>
                <span className="text-lg font-bold text-gray-900">{formatBRL(total)}</span>
              </div>
              <button onClick={join} disabled={busy} className="w-full bg-sky-600 text-white py-3.5 rounded-xl font-bold hover:bg-sky-700 disabled:opacity-60">
                {busy ? 'Abrindo pagamento…' : `Entrar no day use · ${formatBRL(total)}`}
              </button>
            </>
          )}
        </div>
      )}
      <BottomNav />
    </div>
  );
}
