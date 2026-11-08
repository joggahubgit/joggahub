// Página da Partida aberta · Day use (jogador): quem já entrou, preço por pessoa,
// entrar pagando no app e sair com reembolso até 24h antes.
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Sun, MapPin, Clock, Users, CheckCircle, AlertTriangle, Info, Share2, Copy } from 'lucide-react';
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
  const [showShare, setShowShare] = useState(false);
  const [copied, setCopied] = useState(false);

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

  function buildShareMessage() {
    if (!du || !session) return '';
    const remaining = du.capacity - du.enrolled_count;
    const playerLines = players.map(p => `✅ ${p.name ?? 'Jogador'}`).join('\n');
    return [
      `☀️ Partida aberta · Day use no JoggaHub!`,
      ``,
      `🏟️ ${SPORT_LABELS[du.sport_type] ?? du.title}`,
      `📅 ${formatSessionDate(session.starts_at.substring(0, 10))}`,
      `🕐 ${session.starts_at.substring(11, 16)} – ${session.ends_at.substring(11, 16)}`,
      `📍 ${du.courts?.name ?? ''} · ${du.venues?.name ?? ''}`,
      `💰 ${formatBRL(Number(du.price))}/pessoa`,
      ``,
      `👥 Jogadores (${du.enrolled_count}/${du.capacity}):`,
      ...(playerLines ? [playerLines] : []),
      ``,
      remaining > 0
        ? `Ainda há ${remaining} ${remaining === 1 ? 'vaga' : 'vagas'}! Entre pelo JoggaHub para participar:`
        : `Day use completo! Acompanhe pelo link:`,
      `${window.location.origin}/day-use/${du.id}`,
    ].join('\n');
  }

  function handleWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(buildShareMessage())}`, '_blank');
    setShowShare(false);
  }

  function handleCopy() {
    navigator.clipboard.writeText(buildShareMessage());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/home'))} aria-label="Voltar"><ArrowLeft className="w-6 h-6" /></button>
          <button onClick={() => setShowShare(true)} aria-label="Compartilhar" className="p-2 -m-2 rounded-full hover:bg-white/10"><Share2 className="w-6 h-6" /></button>
        </div>
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
              // Vaga livre: "+" para entrar (igual à página de partida), quando dá para entrar
              const canJoin = !p && showBar && open && left > 0 && !busy;
              return (
                <div key={i} className="flex flex-col items-center gap-1 min-w-0">
                  {canJoin ? (
                    <button onClick={join} aria-label="Entrar no day use"
                      className="w-11 h-11 rounded-full border-2 border-dashed border-sky-300 flex items-center justify-center transition-colors hover:border-sky-500 hover:bg-sky-50 active:bg-sky-100">
                      <span className="text-xl font-light text-sky-500">+</span>
                    </button>
                  ) : (
                    <div className={`w-11 h-11 rounded-full overflow-hidden flex items-center justify-center ${p ? 'bg-sky-100 border-2 border-sky-300' : 'border-2 border-dashed border-gray-200'}`}>
                      {p?.avatar_url ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                        : p ? <span className="text-sky-700 font-bold">{(p.name ?? '?').charAt(0).toUpperCase()}</span> : null}
                    </div>
                  )}
                  <span className="text-[10px] text-gray-500 truncate w-full text-center">{p ? (p.name ?? 'Jogador').split(' ')[0] : ''}</span>
                </div>
              );
            })}
          </div>
        </div>

        {joined && !cancelled && left > 0 && (
          <div className="bg-gradient-to-r from-sky-500 to-sky-600 rounded-2xl p-5">
            <p className="font-bold text-white text-base mb-1">Divulgue o day use!</p>
            <p className="text-sm text-sky-100 mb-4">Faltam {left} {left === 1 ? 'jogador' : 'jogadores'} para completar</p>
            <button onClick={() => setShowShare(true)}
              className="w-full bg-white text-sky-700 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-sky-50 transition-colors">
              <Share2 className="w-4 h-4" />Compartilhar day use
            </button>
          </div>
        )}

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
      {showShare && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50" onClick={() => setShowShare(false)}>
          <div className="bg-white rounded-t-3xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-5" />
            <h3 className="font-bold text-gray-900 text-lg mb-5">Compartilhar day use</h3>
            <div className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-100 max-h-64 overflow-y-auto">
              <p className="text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wide">Mensagem gerada</p>
              <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{buildShareMessage()}</pre>
            </div>
            <div className="space-y-3">
              <button onClick={handleWhatsApp}
                className="w-full bg-green-500 text-white rounded-2xl py-4 font-semibold flex items-center justify-center gap-3 hover:bg-green-600 transition-colors">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.121-.011-.241-.017-.361-.017-.407 0-.823.063-1.22.192l-.016.005a9.87 9.87 0 00-4.599 3.317 9.87 9.87 0 00-1.96 5.985c0 2.64 1.03 5.122 2.898 6.988a9.825 9.825 0 006.994 2.893c5.45-.003 9.884-4.437 9.884-9.885a9.86 9.86 0 00-2.893-6.994z"/>
                </svg>
                Compartilhar via WhatsApp
              </button>
              <button onClick={handleCopy}
                className="w-full bg-gray-100 text-gray-800 rounded-2xl py-4 font-semibold flex items-center justify-center gap-3 hover:bg-gray-200 transition-colors">
                {copied ? <><CheckCircle className="w-5 h-5 text-green-600" /> Copiado!</> : <><Copy className="w-5 h-5" /> Copiar mensagem</>}
              </button>
            </div>
            <button onClick={() => setShowShare(false)} className="w-full mt-3 py-3 text-sm text-gray-500 font-semibold">Fechar</button>
          </div>
        </div>
      )}
      <BottomNav />
    </div>
  );
}
