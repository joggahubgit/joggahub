// Administração: todas as cobranças do Stripe num período (fonte da verdade do
// dinheiro), ligadas ao registro do app (partida, aula, day use).
// Só administradores do JoggaHub (platform_admins).
//
// Cada pagamento (PaymentIntent) é ligado ao app pelo código do pagamento:
//   jogador da partida (game_players), inscrição (class_enrollments) ou, para o
//   organizador, pela sessão de checkout (games.stripe_session_id).
// Pagamentos sem registro no app (testes antigos, cobranças feitas fora do app)
// não entram nos números; a resposta diz quantos foram deixados de fora.
//
// Entrada: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' } (data do pagamento, Brasília)

import Stripe from 'https://esm.sh/stripe@14.21.0';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/checkout.ts';

const MAX = 1000;
const brl = (cents: number | null | undefined) => Math.round(cents ?? 0) / 100;
/** taxa JoggaHub = 8% + R$2,50 sobre a parte do clube → parte do clube = (total − 2,50) / 1,08 */
const clubFromGross = (gross: number) => (gross > 0 ? Math.round(((gross - 2.5) / 1.08) * 100) / 100 : 0);

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
    const gte = Math.floor(new Date(`${from}T00:00:00-03:00`).getTime() / 1000);
    const lte = Math.floor(new Date(`${to}T23:59:59-03:00`).getTime() / 1000);

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2023-10-16' });
    const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    // 1. Pagamentos do período
    const pis: Stripe.PaymentIntent[] = [];
    let truncated = false;
    for await (const pi of stripe.paymentIntents.list({
      created: { gte, lte }, limit: 100, expand: ['data.latest_charge', 'data.latest_charge.balance_transaction'],
    })) {
      if (!['succeeded', 'requires_capture', 'canceled'].includes(pi.status)) continue; // não concluídos
      pis.push(pi);
      if (pis.length >= MAX) { truncated = true; break; }
    }
    const ids = pis.map(p => p.id);

    // 2. Ligação com o app pelo código do pagamento
    // deno-lint-ignore no-explicit-any
    type Link = { kind: 'game' | 'class'; refId: string; playerId: string | null; game?: any; cls?: any };
    const link = new Map<string, Link>();
    if (ids.length) {
      const [{ data: gp }, { data: en }] = await Promise.all([
        db.from('game_players').select('game_id, player_id, stripe_payment_intent_id').in('stripe_payment_intent_id', ids),
        db.from('class_enrollments').select('class_id, player_id, stripe_payment_intent_id').in('stripe_payment_intent_id', ids),
      ]);
      for (const r of gp ?? []) link.set(r.stripe_payment_intent_id, { kind: 'game', refId: r.game_id, playerId: r.player_id });
      for (const r of en ?? []) link.set(r.stripe_payment_intent_id, { kind: 'class', refId: r.class_id, playerId: r.player_id });
    }
    // Organizador: retenção gravada na partida (novas) ou pela sessão de checkout (antigas)
    {
      const ids0 = pis.filter(p => !link.has(p.id)).map(p => p.id);
      if (ids0.length) {
        const { data: og } = await db.from('games').select('id, organizer_id, organizer_payment_intent_id').in('organizer_payment_intent_id', ids0);
        for (const g of og ?? []) link.set(g.organizer_payment_intent_id, { kind: 'game', refId: g.id, playerId: g.organizer_id });
      }
    }
    const unlinked = pis.filter(p => !link.has(p.id));
    if (unlinked.length) {
      const sessionByPi = new Map<string, Stripe.Checkout.Session>();
      await Promise.all(unlinked.map(async p => {
        try {
          const r = await stripe.checkout.sessions.list({ payment_intent: p.id, limit: 1 });
          if (r.data[0]) sessionByPi.set(p.id, r.data[0]);
        } catch { /* sem sessão */ }
      }));
      const sessionIds = [...sessionByPi.values()].map(s => s.id);
      if (sessionIds.length) {
        const { data: gs } = await db.from('games').select('id, organizer_id, stripe_session_id').in('stripe_session_id', sessionIds);
        const bySession = new Map((gs ?? []).map(g => [g.stripe_session_id, g]));
        for (const [piId, s] of sessionByPi) {
          const g = bySession.get(s.id);
          if (g) link.set(piId, { kind: 'game', refId: g.id, playerId: g.organizer_id });
        }
      }
    }

    // 3. Detalhes das partidas/aulas, quadras e nomes
    const gameIds = [...new Set([...link.values()].filter(l => l.kind === 'game').map(l => l.refId))];
    const classIds = [...new Set([...link.values()].filter(l => l.kind === 'class').map(l => l.refId))];
    const playerIds = [...new Set([...link.values()].map(l => l.playerId).filter(Boolean) as string[])];
    const [{ data: games }, { data: classes }, { data: profiles }] = await Promise.all([
      gameIds.length ? db.from('games').select('id, court_id, is_open, scheduled_at, status').in('id', gameIds) : Promise.resolve({ data: [] }),
      classIds.length ? db.from('classes').select('id, court_id, kind, title').in('id', classIds) : Promise.resolve({ data: [] }),
      playerIds.length ? db.from('profiles').select('id, name').in('id', playerIds) : Promise.resolve({ data: [] }),
    ]);
    // deno-lint-ignore no-explicit-any
    const gameMap = new Map((games ?? []).map((g: any) => [g.id, g]));
    // deno-lint-ignore no-explicit-any
    const classMap = new Map((classes ?? []).map((c: any) => [c.id, c]));
    // deno-lint-ignore no-explicit-any
    const nameMap = new Map((profiles ?? []).map((p: any) => [p.id, p.name]));
    const courtIds = [...new Set([...gameMap.values(), ...classMap.values()].map(x => x.court_id).filter(Boolean))];
    const { data: courts } = courtIds.length
      ? await db.from('courts').select('id, name, venue_id, venues(name)').in('id', courtIds)
      : { data: [] };
    // deno-lint-ignore no-explicit-any
    const courtMap = new Map((courts ?? []).map((c: any) => [c.id, c]));

    // 4. Uma linha por pagamento ligado ao app
    let hidden = 0;
    const transactions = [];
    for (const pi of pis) {
      const l = link.get(pi.id);
      const game = l?.kind === 'game' ? gameMap.get(l.refId) : null;
      const cls = l?.kind === 'class' ? classMap.get(l.refId) : null;
      if (!game && !cls) { hidden++; continue; }

      const charge = (pi.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : null) as Stripe.Charge | null;
      const bt = (charge?.balance_transaction && typeof charge.balance_transaction === 'object' ? charge.balance_transaction : null) as Stripe.BalanceTransaction | null;
      const charged = brl(pi.amount_received);
      const held = pi.status === 'requires_capture' ? brl(pi.amount_capturable) : 0;
      const refunded = brl(charge?.amount_refunded);
      const effective = Math.max(0, (charged || held) - refunded);
      const club = clubFromGross(effective);
      const platformFee = effective > 0 ? Math.round((effective - club) * 100) / 100 : 0;
      const stripeFee = bt ? brl(bt.fee) : 0;

      let status: string;
      if (refunded > 0 && refunded >= (charged || brl(pi.amount))) status = 'reembolsado';
      else if (refunded > 0) status = 'reembolsado_parcial';
      else if (pi.status === 'succeeded') status = 'pago';
      else if (pi.status === 'requires_capture') status = 'retido';
      else status = 'liberado';

      const tipo = cls ? (cls.kind === 'day_use' ? 'day_use' : 'aula') : (game.is_open ? 'partida_aberta' : 'partida_fechada');
      const court = courtMap.get((game ?? cls).court_id);
      transactions.push({
        id: pi.id,
        session_id: pi.id,
        created_at: new Date((charge?.created ?? pi.created) * 1000).toISOString(),
        tipo,
        ref_id: l!.refId,
        venue_id: court?.venue_id ?? null,
        venue_name: court?.venues?.name ?? '—',
        court_name: court?.name ?? '—',
        player: l!.playerId ? (nameMap.get(l!.playerId) ?? 'Jogador') : 'Jogador',
        description: pi.description ?? null,
        gross: brl(pi.amount), charged, held, refunded,
        club_share: club, platform_fee: platformFee, stripe_fee: stripeFee,
        net_platform: Math.round((platformFee - stripeFee) * 100) / 100,
        status,
        livemode: pi.livemode,
      });
    }
    transactions.sort((a, b) => b.created_at.localeCompare(a.created_at));

    return json({ transactions, truncated, hidden });
  } catch (e) {
    console.error('[admin-transactions]', e);
    return json({ error: (e as Error).message ?? 'Erro ao buscar transações' }, 500);
  }
});
