// Administração: todas as cobranças feitas no Stripe num período (fonte da
// verdade do dinheiro), ligadas ao clube/partida/curso do app.
// Só administradores do JoggaHub (platform_admins).
//
// Entrada: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' } (datas do pagamento, horário de Brasília)
// Saída: { transactions: [...], truncated: boolean }

import Stripe from 'https://esm.sh/stripe@14.21.0';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/checkout.ts';

const MAX_SESSIONS = 1000;
const brl = (cents: number | null | undefined) => Math.round(cents ?? 0) / 100;
/** taxa JoggaHub = 8% + R$2,50 sobre a parte do clube → parte do clube = (total − 2,50) / 1,08 */
const clubFromGross = (gross: number) => (gross > 0 ? Math.round(((gross - 2.5) / 1.08) * 100) / 100 : 0);

const TIPO_BY_KIND: Record<string, string> = {
  private_game: 'partida_fechada', pay_reservation: 'partida_fechada',
  organizer: 'partida_aberta', join: 'partida_aberta',
  class_enrollment: 'aula',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);
    const userClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } });
    const { data: isAdmin } = await userClient.rpc('is_platform_admin');
    if (isAdmin !== true) return json({ error: 'Acesso restrito à administração do JoggaHub.' }, 403);

    const { from, to } = await req.json().catch(() => ({}));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(to ?? '')) return json({ error: 'Período inválido' }, 400);
    // Brasília = UTC−3
    const gte = Math.floor(new Date(`${from}T00:00:00-03:00`).getTime() / 1000);
    const lte = Math.floor(new Date(`${to}T23:59:59-03:00`).getTime() / 1000);

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2023-10-16' });
    const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    // 1. Sessões de checkout concluídas no período (todos os pagamentos do app passam por elas)
    const sessions: Stripe.Checkout.Session[] = [];
    let truncated = false;
    for await (const s of stripe.checkout.sessions.list({
      created: { gte, lte }, status: 'complete', limit: 100,
      expand: ['data.payment_intent', 'data.payment_intent.latest_charge', 'data.payment_intent.latest_charge.balance_transaction'],
    })) {
      sessions.push(s);
      if (sessions.length >= MAX_SESSIONS) { truncated = true; break; }
    }

    // 2. Ligar cada pagamento ao clube: courtId direto, ou pela partida/curso
    const md = (s: Stripe.Checkout.Session) => (s.metadata ?? {}) as Record<string, string>;
    const gameIds = [...new Set(sessions.map(s => md(s).gameId).filter(Boolean))];
    const classIds = [...new Set(sessions.map(s => md(s).classId).filter(Boolean))];
    const userIds = [...new Set(sessions.map(s => md(s).userId ?? s.client_reference_id).filter(Boolean) as string[])];

    const [{ data: games }, { data: classes }, { data: profiles }] = await Promise.all([
      gameIds.length ? db.from('games').select('id, court_id, is_open').in('id', gameIds) : Promise.resolve({ data: [] }),
      classIds.length ? db.from('classes').select('id, court_id, kind, title').in('id', classIds) : Promise.resolve({ data: [] }),
      userIds.length ? db.from('profiles').select('id, name').in('id', userIds) : Promise.resolve({ data: [] }),
    ]);
    // deno-lint-ignore no-explicit-any
    const gameMap = new Map((games ?? []).map((g: any) => [g.id, g]));
    // deno-lint-ignore no-explicit-any
    const classMap = new Map((classes ?? []).map((c: any) => [c.id, c]));
    // deno-lint-ignore no-explicit-any
    const nameMap = new Map((profiles ?? []).map((p: any) => [p.id, p.name]));

    const courtIds = new Set<string>();
    for (const s of sessions) {
      const m = md(s);
      const court = m.courtId || gameMap.get(m.gameId)?.court_id || classMap.get(m.classId)?.court_id;
      if (court) courtIds.add(court);
    }
    const { data: courts } = courtIds.size
      ? await db.from('courts').select('id, name, venue_id, venues(name)').in('id', [...courtIds])
      : { data: [] };
    // deno-lint-ignore no-explicit-any
    const courtMap = new Map((courts ?? []).map((c: any) => [c.id, c]));

    // 3. Uma linha por pagamento
    const transactions = sessions.map(s => {
      const m = md(s);
      const pi = (typeof s.payment_intent === 'object' ? s.payment_intent : null) as Stripe.PaymentIntent | null;
      const charge = (pi?.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : null) as Stripe.Charge | null;
      const bt = (charge?.balance_transaction && typeof charge.balance_transaction === 'object' ? charge.balance_transaction : null) as Stripe.BalanceTransaction | null;

      const gross = brl(s.amount_total);
      const charged = brl(pi?.amount_received);
      const held = pi?.status === 'requires_capture' ? brl(pi.amount_capturable) : 0;
      const refunded = brl(charge?.amount_refunded);
      const effective = Math.max(0, (charged || held) - refunded);
      const club = clubFromGross(effective);
      const platformFee = effective > 0 ? Math.round((effective - club) * 100) / 100 : 0;
      const stripeFee = bt ? brl(bt.fee) : 0;

      let status: string;
      if (refunded > 0 && refunded >= (charged || gross)) status = 'reembolsado';
      else if (refunded > 0) status = 'reembolsado_parcial';
      else if (pi?.status === 'succeeded') status = 'pago';
      else if (pi?.status === 'requires_capture') status = 'retido';
      else if (pi?.status === 'canceled') status = 'liberado';
      else status = 'incompleto';

      const cls = classMap.get(m.classId);
      const game = gameMap.get(m.gameId);
      let tipo = m.tipo || TIPO_BY_KIND[m.kind] || 'outro';
      if (m.kind === 'class_enrollment' && cls?.kind === 'day_use') tipo = 'day_use';
      if (m.kind === 'join' && game && game.is_open === false) tipo = 'partida_fechada';
      const courtId = m.courtId || game?.court_id || cls?.court_id || null;
      const court = courtId ? courtMap.get(courtId) : null;
      const userId = m.userId || s.client_reference_id || null;

      return {
        id: pi?.id ?? s.id,
        session_id: s.id,
        created_at: new Date(((charge?.created ?? s.created)) * 1000).toISOString(),
        tipo,
        venue_id: court?.venue_id ?? null,
        venue_name: court?.venues?.name ?? '—',
        court_name: court?.name ?? '—',
        player: userId ? (nameMap.get(userId) ?? 'Jogador') : (s.customer_details?.name ?? 'Jogador'),
        description: pi?.description ?? null,
        gross, charged, held, refunded,
        club_share: club, platform_fee: platformFee, stripe_fee: stripeFee,
        net_platform: Math.round((platformFee - stripeFee) * 100) / 100,
        status,
        livemode: s.livemode,
      };
    }).sort((a, b) => b.created_at.localeCompare(a.created_at));

    return json({ transactions, truncated });
  } catch (e) {
    console.error('[admin-transactions]', e);
    return json({ error: (e as Error).message ?? 'Erro ao buscar transações' }, 500);
  }
});
