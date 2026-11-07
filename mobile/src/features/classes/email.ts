// Email "Inscrição confirmada" para o próprio aluno — mesmo modelo do site
// (src/app/lib/emailHtml.ts). A função send-notification-email só envia para o
// email do usuário logado. Falhar aqui nunca bloqueia a inscrição.
import { supabase } from '@/lib/supabase';
import { classEnrolledEmail, formatSessionDate } from '@/lib/shared';

const sent = new Set<string>();

export async function sendClassEmail(classId: string, sessionId: string) {
  if (sent.has(sessionId)) return;
  sent.add(sessionId);
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return;
    const [{ data: c }, { data: s }, { data: e }] = await Promise.all([
      supabase.from('classes').select('title, coach_name, venues(name), courts(name)').eq('id', classId).maybeSingle(),
      supabase.from('class_sessions').select('starts_at, ends_at').eq('class_id', classId).order('starts_at'),
      supabase.from('class_enrollments').select('amount_paid, service_fee').eq('stripe_session_id', sessionId).maybeSingle(),
    ]);
    if (!c) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cls = c as any;
    const html = classEnrolledEmail({
      title: cls.title,
      coach: cls.coach_name,
      venueName: cls.venues?.name ?? '',
      courtName: cls.courts?.name ?? '',
      sessions: (s ?? []).map(x => `${formatSessionDate(x.starts_at.substring(0, 10))} · ${x.starts_at.substring(11, 16)}–${x.ends_at.substring(11, 16)}`),
      total: (Number(e?.amount_paid ?? 0) + Number(e?.service_fee ?? 0)).toFixed(2).replace('.', ','),
    });
    await supabase.functions.invoke('send-notification-email', {
      body: { to: user.email, subject: 'Inscrição confirmada no JoggaHub 🎓', html },
    });
  } catch (err) {
    console.warn('[class email]', err);
  }
}
