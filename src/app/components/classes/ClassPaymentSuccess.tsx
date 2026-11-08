// Volta do Stripe após pagar um curso. O servidor (finalize-checkout ou o
// webhook, o que chegar primeiro) cria a inscrição; aqui só esperamos e mostramos.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import BottomNav from '../BottomNav';
import { classEnrolledEmail, sendEmail } from '../../lib/emailTemplates';
import { formatSessionDate } from '../../lib/classSchedule';

/** Email de confirmação para o próprio aluno (só na primeira vez que a inscrição é criada). */
async function sendClassEmail(classId: string, sessionId: string) {
  try {
    const key = `class_email_${sessionId}`;
    if (localStorage.getItem(key)) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return;
    const [{ data: c }, { data: s }, { data: e }] = await Promise.all([
      supabase.from('classes').select('title, coach_name, venues(name), courts(name)').eq('id', classId).maybeSingle(),
      supabase.from('class_sessions').select('starts_at, ends_at').eq('class_id', classId).order('starts_at'),
      supabase.from('class_enrollments').select('amount_paid, service_fee').eq('stripe_session_id', sessionId).maybeSingle(),
    ]);
    if (!c) return;
    const cls = c as any;
    await sendEmail(user.email, 'Inscrição confirmada no JoggaHub 🎓', classEnrolledEmail({
      title: cls.title,
      coach: cls.coach_name,
      venueName: cls.venues?.name ?? '',
      courtName: cls.courts?.name ?? '',
      sessions: (s ?? []).map(x => `${formatSessionDate(x.starts_at.substring(0, 10))} · ${x.starts_at.substring(11, 16)}–${x.ends_at.substring(11, 16)}`),
      total: (Number(e?.amount_paid ?? 0) + Number(e?.service_fee ?? 0)).toFixed(2).replace('.', ','),
    }));
    localStorage.setItem(key, '1');
  } catch (err) {
    console.error('[class email]', err);
  }
}

type State = { kind: 'waiting' } | { kind: 'done'; classId: string } | { kind: 'failed'; error: string };

export default function ClassPaymentSuccess() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = params.get('session_id');
  const [state, setState] = useState<State>({ kind: 'waiting' });
  const tries = useRef(0);

  useEffect(() => {
    if (!sessionId) { setState({ kind: 'failed', error: 'Pagamento não encontrado.' }); return; }
    let stop = false;
    async function poll() {
      if (stop) return;
      tries.current += 1;
      const { data } = await supabase.functions.invoke('finalize-checkout', { body: { sessionId } });
      if (stop) return;
      if (data?.status === 'done' && data.classId) {
        setState({ kind: 'done', classId: data.classId });
        // Sempre na primeira confirmação nesta tela (o webhook pode ter criado a inscrição antes)
        sendClassEmail(data.classId, sessionId!);
        return;
      }
      if (data?.status === 'failed') { setState({ kind: 'failed', error: data.error ?? 'Não foi possível concluir a inscrição.' }); return; }
      if (tries.current >= 20) {
        setState({ kind: 'failed', error: 'Seu pagamento está sendo processado. Confira o curso em alguns minutos.' });
        return;
      }
      setTimeout(poll, 1500);
    }
    poll();
    return () => { stop = true; };
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl border border-gray-200 p-8 max-w-sm w-full text-center">
        {state.kind === 'waiting' && (
          <>
            <Loader2 className="w-12 h-12 text-violet-600 animate-spin mx-auto mb-4" />
            <p className="font-bold text-gray-900 text-lg">Confirmando sua inscrição…</p>
            <p className="text-sm text-gray-500 mt-1">Só um instante.</p>
          </>
        )}
        {state.kind === 'done' && (
          <>
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4"><CheckCircle className="w-9 h-9 text-green-600" /></div>
            <p className="font-bold text-gray-900 text-xl">Inscrição confirmada!</p>
            <p className="text-sm text-gray-500 mt-1">Sua vaga está garantida em todas as aulas.</p>
            <button onClick={() => navigate(`/aulas/${state.classId}`, { replace: true })}
              className="mt-6 w-full bg-violet-600 text-white py-3 rounded-xl font-bold">Ver o curso</button>
          </>
        )}
        {state.kind === 'failed' && (
          <>
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <p className="font-bold text-gray-900 text-lg">Inscrição não concluída</p>
            <p className="text-sm text-gray-500 mt-1">{state.error}</p>
            <button onClick={() => navigate('/aulas', { replace: true })}
              className="mt-6 w-full bg-gray-900 text-white py-3 rounded-xl font-bold">Ver cursos</button>
          </>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
