import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, GraduationCap, MapPin, CalendarDays, Users, CheckCircle, AlertTriangle, Info } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import BottomNav from '../BottomNav';
import ScheduledStatusBanner, { useMyScheduledPayment } from '../payments/ScheduledStatusBanner';
import { CLASS_ENROLL_CUTOFF_HOURS, CLASS_LEAVE_HOURS, classLevelLabel, classPaymentPlan, classServiceFee, formatBRL, formatSessionDate } from '../../lib/classSchedule';

interface ClassFull {
  id: string; kind?: string; title: string; coach_name: string; description: string | null; level: string;
  capacity: number; enrolled_count: number; price: number; lesson_count: number;
  start_date: string; end_date: string; status: string;
  venues: { name: string; city: string | null; address: string | null } | null;
  courts: { name: string } | null;
}
interface Session { id: string; starts_at: string; ends_at: string }
interface Enrollment { id: string; status: string; refunded: boolean; amount_paid: number; service_fee: number; payment_held: boolean }

export const LEAVE_REFUND_HOURS = CLASS_LEAVE_HOURS;

/** "Agora" na hora de Brasília, na mesma convenção dos horários gravados (wall clock). */
export function wallNowMs() {
  const s = new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(' ', 'T');
  return new Date(`${s}Z`).getTime();
}
const wallMs = (iso: string) => new Date(`${iso.substring(0, 19)}Z`).getTime();

async function fnError(err: unknown, fallback: string) {
  try {
    const body = await (err as { context?: Response }).context?.json();
    if (body?.error) return body.error as string;
  } catch { /* ignore */ }
  return (err as Error)?.message ?? fallback;
}

export default function ClassDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [cls, setCls] = useState<ClassFull | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [notice, setNotice] = useState('');
  const myScheduled = useMyScheduledPayment({ classId: id }, enrollment?.status);

  const load = useCallback(async () => {
    if (!id) return;
    const [{ data: c }, { data: s }, { data: e }] = await Promise.all([
      supabase.from('classes')
        .select('id, kind, title, coach_name, description, level, capacity, enrolled_count, price, lesson_count, start_date, end_date, status, venues(name, city, address), courts(name)')
        .eq('id', id).maybeSingle(),
      supabase.from('class_sessions').select('id, starts_at, ends_at').eq('class_id', id).order('starts_at'),
      user
        ? supabase.from('class_enrollments').select('id, status, refunded, amount_paid, service_fee, payment_held')
            .eq('class_id', id).eq('player_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    setCls(c as unknown as ClassFull);
    setSessions(s ?? []);
    setEnrollment((e as Enrollment) ?? null);
    setLoading(false);
  }, [id, user]);

  useEffect(() => { load(); }, [load]);

  async function enroll() {
    if (!cls) return;
    setBusy(true);
    setError('');
    const origin = window.location.origin;
    const { data, error: fnErr } = await supabase.functions.invoke('create-class-checkout-session', {
      body: { classId: cls.id, successUrl: `${origin}/aulas/pagamento`, cancelUrl: `${origin}/aulas/${cls.id}` },
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
    if (fnErr) { setError(await fnError(fnErr, 'Não foi possível cancelar sua inscrição.')); return; }
    setNotice(enrollment.payment_held
      ? 'Inscrição cancelada. A reserva no seu cartão foi liberada, nada foi cobrado.'
      : data?.refunded ? 'Inscrição cancelada. O valor total foi reembolsado no seu cartão.' : 'Inscrição cancelada.');
    load();
  }

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">Carregando...</div>;
  if (!cls) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <GraduationCap className="w-12 h-12 text-gray-300" />
        <p className="text-gray-600 font-semibold">Curso não encontrado</p>
        <button onClick={() => navigate('/aulas')} className="text-violet-600 font-semibold">Ver cursos</button>
      </div>
    );
  }

  if (cls.kind === 'day_use') return <Navigate to={`/day-use/${cls.id}`} replace />;

  const enrolled = enrollment?.status === 'active';
  const firstStart = sessions[0]?.starts_at;
  const now = wallNowMs();
  const enrollOpen = !!firstStart && wallMs(firstStart) - CLASS_ENROLL_CUTOFF_HOURS * 3600_000 > now;
  const canLeaveWithRefund = !!firstStart && wallMs(firstStart) - LEAVE_REFUND_HOURS * 3600_000 > now;
  const left = cls.capacity - cls.enrolled_count;
  const fee = classServiceFee(Number(cls.price));
  const total = Number(cls.price) + fee;
  const cancelled = cls.status !== 'active';
  const plan = firstStart ? classPaymentPlan(firstStart, now) : null;

  return (
    <div className={`min-h-screen bg-gray-50 ${!enrolled && !cancelled ? 'pb-64' : 'pb-24'}`}>
      <div className="bg-violet-600 text-white px-6 pt-6 pb-8 rounded-b-3xl">
        <button onClick={() => navigate('/aulas')} aria-label="Voltar" className="mb-4"><ArrowLeft className="w-6 h-6" /></button>
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-200">{classLevelLabel(cls.level)}</p>
        <h1 className="text-2xl font-bold mt-1">{cls.title}</h1>
        <p className="text-violet-100 mt-1">com Prof. {cls.coach_name}</p>
      </div>

      <div className="px-6 -mt-4 space-y-3">
        {cancelled && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 text-sm">Este curso foi cancelado pelo clube.</div>
        )}
        {notice && (
          <div className="bg-green-50 border border-green-200 text-green-800 rounded-2xl p-4 text-sm flex gap-2"><CheckCircle className="w-4 h-4 mt-0.5" />{notice}</div>
        )}
        {enrolled && (
          <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 flex gap-3">
            <CheckCircle className="w-5 h-5 text-violet-600 flex-shrink-0" />
            <div>
              <p className="font-semibold text-violet-900">Você está inscrito</p>
              <p className="text-sm text-violet-700">
                {myScheduled
                  ? <>Inscrição garantida com o cartão salvo.</>
                  : enrollment!.payment_held && plan
                  ? <>{formatBRL(Number(enrollment!.amount_paid) + Number(enrollment!.service_fee))} reservado no seu cartão. Cobrado só em <b>{plan.chargeAt}</b>.</>
                  : <>Pago {formatBRL(Number(enrollment!.amount_paid) + Number(enrollment!.service_fee))}. Até a primeira aula!</>}
              </p>
            </div>
          </div>
        )}

        {enrolled && <ScheduledStatusBanner payment={myScheduled} />}

        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3 text-sm text-gray-700">
          <p className="flex items-start gap-3"><MapPin className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <span><b className="text-gray-900">{cls.venues?.name}</b> · {cls.courts?.name}{cls.venues?.address ? <><br /><span className="text-gray-500">{cls.venues.address}{cls.venues.city ? `, ${cls.venues.city}` : ''}</span></> : null}</span>
          </p>
          <p className="flex items-center gap-3"><CalendarDays className="w-5 h-5 text-gray-400" />{cls.lesson_count} aulas</p>
          <p className="flex items-center gap-3"><Users className="w-5 h-5 text-gray-400" />
            {cls.enrolled_count}/{cls.capacity} alunos{!cancelled && !enrolled && (left > 0 ? ` · ${left} ${left === 1 ? 'vaga' : 'vagas'}` : ' · Lotado')}
          </p>
          {cls.description && <p className="pt-2 border-t border-gray-100 whitespace-pre-line text-gray-600">{cls.description}</p>}
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Datas das aulas</p>
          <div className="divide-y divide-gray-100">
            {sessions.map((s, i) => (
              <div key={s.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-gray-500 w-14">Aula {i + 1}</span>
                <span className="flex-1 font-medium text-gray-900 capitalize">{formatSessionDate(s.starts_at.substring(0, 10))}</span>
                <span className="text-gray-600 tabular-nums">{s.starts_at.substring(11, 16)}–{s.ends_at.substring(11, 16)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5 text-sm space-y-2">
          <p className="flex items-center gap-2 font-semibold text-gray-900"><Info className="w-4 h-4 text-violet-600" />Como funciona</p>
          <p className="text-gray-600">Você paga o curso inteiro pelo app e garante a vaga em todas as aulas. Como nas partidas, o valor fica reservado no cartão e só é cobrado {CLASS_ENROLL_CUTOFF_HOURS}h antes da primeira aula{plan ? <> (<b>{plan.chargeAt}</b>)</> : null}. Se faltar mais de 6 dias, nada é cobrado agora: seu cartão fica salvo e o valor é reservado 6 dias antes{plan && !plan.hold ? <> (<b>{plan.holdOn}</b>)</> : null}.</p>
          <p className="text-gray-600">Desistiu? Sem custo até {LEAVE_REFUND_HOURS}h antes da primeira aula{plan ? <> (<b>{plan.leaveUntil}</b>)</> : null}. Se o clube cancelar o curso, você recebe tudo de volta.</p>
          <p className="text-gray-600">As inscrições fecham {CLASS_ENROLL_CUTOFF_HOURS}h antes da primeira aula.</p>
        </div>

        {enrolled && (
          <div className="pt-1">
            {!canLeaveWithRefund ? (
              <p className="text-xs text-gray-400 text-center">O prazo para desistir com reembolso já passou. Fale com o clube.</p>
            ) : !confirmLeave ? (
              <button onClick={() => setConfirmLeave(true)} className="w-full py-3 text-sm font-semibold text-red-600">Desistir do curso</button>
            ) : (
              <div className="bg-white border border-red-200 rounded-2xl p-4 space-y-3">
                <p className="flex gap-2 text-sm text-gray-700"><AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />{enrollment?.payment_held ? 'Você perde a vaga e a reserva no seu cartão é liberada. Nada é cobrado.' : 'Você perde a vaga e recebe o valor total de volta no cartão.'}</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmLeave(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700">Voltar</button>
                  <button onClick={leave} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold disabled:opacity-60">{busy ? 'Cancelando…' : 'Confirmar'}</button>
                </div>
              </div>
            )}
          </div>
        )}

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 text-sm">{error}</div>}
      </div>

      {!enrolled && !cancelled && (
        // Fica logo acima do menu de baixo (Início / Comunidade / Perfil)
        <div className="fixed bottom-[69px] left-0 right-0 max-w-md mx-auto z-40 bg-white border-t border-gray-200 px-6 py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
          <div>
            {left <= 0 ? (
              <p className="text-center text-sm font-semibold text-gray-500 py-2">Curso lotado</p>
            ) : !enrollOpen ? (
              <p className="text-center text-sm font-semibold text-gray-500 py-2">Inscrições encerradas</p>
            ) : (
              <>
                <div className="flex items-baseline justify-between mb-2 text-sm">
                  <span className="text-gray-500">Curso {formatBRL(Number(cls.price))} + taxa {formatBRL(fee)}</span>
                  <span className="text-lg font-bold text-gray-900">{formatBRL(total)}</span>
                </div>
                {plan && (
                  <p className="text-xs text-gray-500 mb-2">
                    {plan.hold
                      ? <>O valor fica reservado no cartão e só é cobrado em <b className="text-gray-700">{plan.chargeAt}</b>. Desistência sem custo até {plan.leaveUntil}.</>
                      : <>Nada é cobrado agora: seu cartão fica salvo. Em <b className="text-gray-700">{plan.holdOn}</b> reservamos o valor e ele é cobrado em {plan.chargeAt}. Desistência sem custo até {plan.leaveUntil}.</>}
                  </p>
                )}
                <button onClick={enroll} disabled={busy}
                  className="w-full bg-violet-600 text-white py-3.5 rounded-xl font-bold hover:bg-violet-700 disabled:opacity-60">
                  {busy ? 'Abrindo pagamento…' : `Inscrever-se · ${formatBRL(total)}`}
                </button>
              </>
            )}
          </div>
        </div>
      )}
      <BottomNav />
    </div>
  );
}
