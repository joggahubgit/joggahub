// Extrato de um lançamento do Financeiro (gestor): quem pagou e quanto, direto
// do Stripe, para bater com o painel de lá. Só o admin do clube pode ver.
//
// Entrada: { kind: 'partida_fechada' | 'partida_aberta' | 'reserva' | 'day_use' | 'aula', refId }
//   partidas → refId = games.id;  reserva (antiga, sem partida) → bookings.id;
//   day_use / aula → refId = class_enrollments.id (o extrato mostra o curso/day use inteiro)

import Stripe from 'https://esm.sh/stripe@14.21.0';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/checkout.ts';

type Line = {
  who: string;
  role: string;
  paymentId: string | null;
  stripeStatus: string;       // texto igual ao do painel do Stripe
  charged: number;            // cobrado no cartão (R$)
  held: number;               // retido, ainda não cobrado (R$)
  refunded: number;           // reembolsado (R$)
  clubShare: number;          // parte do clube (sem a taxa JoggaHub)
  fee: number;                // taxa JoggaHub
  date: string | null;        // data do pagamento
};

const brl = (cents: number) => Math.round(cents) / 100;
/** taxa = 8% + R$2,50 sobre a parte do clube → parte do clube = (total − 2,50) / 1,08 */
const clubFromGross = (gross: number) => (gross > 0 ? Math.round(((gross - 2.5) / 1.08) * 100) / 100 : 0);

function stripeLabel(pi: Stripe.PaymentIntent, refunded: number) {
  if (refunded > 0 && refunded * 100 >= (pi.amount_received || pi.amount)) return 'Reembolsado';
  if (refunded > 0) return 'Reembolsado parcialmente';
  switch (pi.status) {
    case 'succeeded': return 'Bem-sucedido';
    case 'requires_capture': return 'Não capturado';
    case 'canceled': return 'Cancelado';
    default: return 'Incompleto';
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);
    const userClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const { kind, refId } = await req.json().catch(() => ({}));
    if (typeof refId !== 'string' || typeof kind !== 'string') return json({ error: 'Lançamento inválido' }, 400);

    const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2023-10-16' });

    const isAdminOfCourt = async (courtId: string | null) => {
      if (!courtId) return false;
      const { data } = await db.from('courts').select('venues(admin_id)').eq('id', courtId).maybeSingle();
      // deno-lint-ignore no-explicit-any
      return (data as any)?.venues?.admin_id === user.id;
    };
    const names = async (ids: string[]) => {
      const { data } = await db.from('profiles').select('id, name').in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
      return new Map((data ?? []).map(p => [p.id, p.name ?? 'Jogador']));
    };

    // Lê um pagamento no Stripe e monta a linha do extrato
    const fromPi = async (piId: string | null, who: string, role: string): Promise<Line> => {
      if (!piId) {
        return { who, role, paymentId: null, stripeStatus: 'Sem pagamento no app', charged: 0, held: 0, refunded: 0, clubShare: 0, fee: 0, date: null };
      }
      const pi = await stripe.paymentIntents.retrieve(piId, { expand: ['latest_charge'] });
      const charge = pi.latest_charge as Stripe.Charge | null;
      const refunded = brl(charge?.amount_refunded ?? 0);
      const charged = brl(pi.amount_received ?? 0);
      const held = pi.status === 'requires_capture' ? brl(pi.amount_capturable ?? pi.amount) : 0;
      const gross = (charged || held) - refunded;
      const club = clubFromGross(gross);
      return {
        who, role, paymentId: pi.id, stripeStatus: stripeLabel(pi, refunded),
        charged, held, refunded,
        clubShare: club, fee: gross > 0 ? Math.round((gross - club) * 100) / 100 : 0,
        date: new Date((charge?.created ?? pi.created) * 1000).toISOString(),
      };
    };
    const piOfSession = async (sessionId: string | null) => {
      if (!sessionId) return null;
      try {
        const s = await stripe.checkout.sessions.retrieve(sessionId);
        return typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id ?? null;
      } catch { return null; }
    };

    let header: Record<string, unknown> = {};
    const lines: Line[] = [];

    if (kind === 'partida_fechada' || kind === 'partida_aberta') {
      const { data: g } = await db.from('games')
        .select('id, court_id, organizer_id, is_open, pay_mode, scheduled_at, court_price, stripe_session_id, status, courts(name)')
        .eq('id', refId).maybeSingle();
      if (!g) return json({ error: 'Partida não encontrada' }, 404);
      if (!(await isAdminOfCourt(g.court_id))) return json({ error: 'Forbidden' }, 403);
      const { data: players } = await db.from('game_players').select('player_id, player_name, paid, stripe_payment_intent_id').eq('game_id', g.id);
      // deno-lint-ignore no-explicit-any
      header = { title: g.is_open ? 'Partida aberta' : 'Partida fechada', court: (g as any).courts?.name, when: g.scheduled_at, courtPrice: g.court_price };
      const orgPi = await piOfSession(g.stripe_session_id);
      const seen = new Set<string>();
      if (orgPi) {
        const org = (players ?? []).find(p => p.player_id === g.organizer_id);
        lines.push(await fromPi(orgPi, org?.player_name ?? (await names([g.organizer_id])).get(g.organizer_id) ?? 'Organizador', 'Organizador'));
        seen.add(orgPi);
      }
      for (const p of players ?? []) {
        if (p.stripe_payment_intent_id && !seen.has(p.stripe_payment_intent_id)) {
          seen.add(p.stripe_payment_intent_id);
          lines.push(await fromPi(p.stripe_payment_intent_id, p.player_name ?? 'Jogador', p.player_id === g.organizer_id ? 'Organizador' : 'Jogador'));
        } else if (!orgPi || p.player_id !== g.organizer_id) {
          if (!p.stripe_payment_intent_id) {
            lines.push({
              who: p.player_name ?? 'Jogador', role: p.player_id === g.organizer_id ? 'Organizador' : 'Jogador', paymentId: null,
              stripeStatus: p.paid ? (g.pay_mode === 'full' && !g.is_open ? 'Incluído no valor do organizador' : 'Pago (sem código do Stripe)') : 'Sem pagamento',
              charged: 0, held: 0, refunded: 0, clubShare: 0, fee: 0, date: null,
            });
          }
        }
      }
    } else if (kind === 'reserva') {
      const { data: b } = await db.from('bookings').select('id, created_by, total_price, payment_status, slots(court_id, start_time, courts(name))').eq('id', refId).maybeSingle();
      // deno-lint-ignore no-explicit-any
      const slot = (b as any)?.slots;
      if (!b || !(await isAdminOfCourt(slot?.court_id))) return json({ error: 'Forbidden' }, 403);
      header = { title: 'Partida fechada (reserva antiga)', court: slot?.courts?.name, when: slot?.start_time };
      lines.push({
        who: (await names([b.created_by])).get(b.created_by) ?? 'Jogador', role: 'Organizador', paymentId: null,
        stripeStatus: b.payment_status === 'paid' ? 'Pago (reserva antiga, sem código)' : 'Sem pagamento',
        charged: b.payment_status === 'paid' ? Number(b.total_price) : 0, held: 0, refunded: 0,
        clubShare: clubFromGross(b.payment_status === 'paid' ? Number(b.total_price) : 0),
        fee: 0, date: null,
      });
    } else if (kind === 'day_use' || kind === 'aula') {
      const { data: en } = await db.from('class_enrollments').select('class_id').eq('id', refId).maybeSingle();
      if (!en) return json({ error: 'Lançamento não encontrado' }, 404);
      const { data: cls } = await db.from('classes').select('id, kind, title, court_id, lesson_count, courts(name)').eq('id', en.class_id).maybeSingle();
      if (!cls || !(await isAdminOfCourt(cls.court_id))) return json({ error: 'Forbidden' }, 403);
      const { data: first } = await db.from('class_sessions').select('starts_at').eq('class_id', cls.id).order('starts_at').limit(1).maybeSingle();
      // deno-lint-ignore no-explicit-any
      header = { title: cls.kind === 'day_use' ? `Day use — ${cls.title}` : `Curso — ${cls.title}`, court: (cls as any).courts?.name, when: first?.starts_at, lessons: cls.lesson_count };
      const { data: ens } = await db.from('class_enrollments').select('player_id, stripe_payment_intent_id, status').eq('class_id', cls.id).order('created_at');
      const nm = await names((ens ?? []).map(e => e.player_id));
      for (const e of ens ?? []) lines.push(await fromPi(e.stripe_payment_intent_id, nm.get(e.player_id) ?? 'Jogador', cls.kind === 'day_use' ? 'Jogador' : 'Aluno'));
    } else {
      return json({ error: 'Tipo inválido' }, 400);
    }

    const total = lines.reduce((a, l) => ({
      charged: a.charged + l.charged, held: a.held + l.held, refunded: a.refunded + l.refunded,
      clubShare: a.clubShare + l.clubShare, fee: a.fee + l.fee,
    }), { charged: 0, held: 0, refunded: 0, clubShare: 0, fee: 0 });

    return json({ header, lines, total });
  } catch (e) {
    console.error('[finance-statement]', e);
    return json({ error: (e as Error).message ?? 'Erro ao montar o extrato' }, 500);
  }
});
