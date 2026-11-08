// SÓ STAGING: cria um mês de novembro realista com pagamentos de TESTE no
// Stripe, para conferir o Financeiro do gestor e o painel de administração.
// Travas: recusa rodar fora do projeto de staging, recusa chave do Stripe que
// não seja de teste (sk_test_) e só aceita administrador do JoggaHub.
// NÃO publicar em produção.

import Stripe from 'https://esm.sh/stripe@14.21.0';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/checkout.ts';

const STAGING_REF = 'vjexysyzbhzkpkoyzchy';
const VENUE = '11111111-1111-4111-8111-111111111111';
const AREIA = '22222222-2222-4222-8222-222222222201';
const SOCIETY = '22222222-2222-4222-8222-222222222202';
const FUTSAL = '22222222-2222-4222-8222-222222222203';
const P = {
  julio: '7154384f-8253-4c36-a11f-ffdd332663bf',
  bia: '842579dc-cdb9-4513-b5b8-358d4eacb789',
  olivia: 'af220bf2-0ee0-4b86-9806-9c9ce581e3f4',
  user: 'c0d278f1-165a-4681-9636-a9092a5c5f4e',
  aron: '09fa38fd-19e2-4412-afa7-e2f854b8131d',
};
const NAMES: Record<string, string> = {
  [P.julio]: 'Júlio Jogador', [P.bia]: 'Bia Jogadora', [P.olivia]: 'Olívia Organizadora', [P.user]: 'User Teste', [P.aron]: 'User Teste 2',
};
const gross = (club: number) => Math.round((club * 1.08 + 2.5) * 100) / 100;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const log: string[] = [];
  try {
    if (!(Deno.env.get('SUPABASE_URL') ?? '').includes(STAGING_REF)) return json({ error: 'Só roda no staging.' }, 403);
    const key = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
    if (!key.startsWith('sk_test_')) return json({ error: 'Chave do Stripe não é de teste. Abortado.' }, 403);
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } });
    const { data: isAdmin } = await userClient.rpc('is_platform_admin');
    if (isAdmin !== true) return json({ error: 'Só administrador.' }, 403);

    const stripe = new Stripe(key, { apiVersion: '2023-10-16' });
    const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    // ── Pagamento de teste no Stripe ───────────────────────────────────────
    type PayMode = 'paid' | 'held' | 'refunded';
    async function pay(amount: number, mode: PayMode, description: string, metadata: Record<string, string>) {
      const pi = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), currency: 'brl',
        payment_method: 'pm_card_visa', payment_method_types: ['card'], confirm: true,
        capture_method: mode === 'held' ? 'manual' : 'automatic',
        description, metadata: { ...metadata, seed: 'staging' },
      });
      if (mode === 'refunded') await stripe.refunds.create({ payment_intent: pi.id });
      return pi.id;
    }

    // ── Horário: reaproveita/cria slot e bloqueia o período ────────────────
    async function block(court: string, start: string, end: string) {
      const s = `${start}:00`, e = `${end}:00`;
      const { data: existing } = await db.from('slots').select('id, start_time').eq('court_id', court)
        .lt('start_time', e).gt('end_time', s).order('start_time');
      let slotId = (existing ?? []).find(x => x.start_time.substring(0, 16) === start)?.id;
      if (!slotId) {
        if ((existing ?? []).length) {
          slotId = existing![0].id;
        } else {
          const { data: ns, error } = await db.from('slots').insert({ court_id: court, start_time: s, end_time: e, is_available: false }).select('id').single();
          if (error) throw new Error(`slot ${start}: ${error.message}`);
          slotId = ns.id;
        }
      }
      await db.from('slots').update({ is_available: false }).eq('court_id', court).lt('start_time', e).gt('end_time', s);
      return slotId!;
    }

    // ── Partida (fechada ou aberta) ────────────────────────────────────────
    async function game(opt: {
      label: string; court: string; sport: string; start: string; end: string; open: boolean;
      courtPrice: number; organizer: string; players: string[]; mode: PayMode; status: string;
      bookingStatus?: string; pendingPayment?: boolean; maxPlayers?: number; free?: boolean;
    }) {
      const slotId = await block(opt.court, opt.start, opt.end);
      let bookingId: string | null = null;
      if (!opt.open) {
        const { data: b, error } = await db.from('bookings').insert({
          slot_id: slotId, court_id: opt.court, created_by: opt.organizer,
          total_price: opt.pendingPayment ? opt.courtPrice : gross(opt.courtPrice),
          max_players: opt.maxPlayers ?? 10, payment_type: 'full',
          payment_status: opt.pendingPayment ? 'pending' : opt.mode === 'refunded' ? 'refunded' : 'paid',
          status: opt.bookingStatus ?? 'confirmed',
        }).select('id').single();
        if (error) throw new Error(`booking ${opt.label}: ${error.message}`);
        bookingId = b.id;
      }
      const n = opt.players.length;
      const { data: g, error: gErr } = await db.from('games').insert({
        organizer_id: opt.organizer, created_by: opt.organizer, court_id: opt.court, slot_id: slotId, booking_id: bookingId,
        scheduled_at: `${opt.start}:00`, scheduled_end_at: `${opt.end}:00`, is_open: opt.open, status: opt.status,
        max_players: opt.maxPlayers ?? (opt.sport === 'futevolei' ? 4 : 10), current_players: n,
        price_per_player: opt.open ? opt.courtPrice / 4 : opt.courtPrice, court_price: opt.courtPrice,
        pay_mode: opt.open ? 'split' : 'full', sport_type: opt.sport, game_type: 'casual',
        stripe_split_captured: !opt.pendingPayment && (opt.mode === 'paid' || opt.mode === 'refunded'),
      }).select('id').single();
      if (gErr) throw new Error(`game ${opt.label}: ${gErr.message}`);

      const tipo = opt.open ? 'partida_aberta' : 'partida_fechada';
      const desc = `${opt.open ? 'Partida aberta' : 'Partida fechada'} — ${opt.label}`;
      for (let i = 0; i < n; i++) {
        const pid = opt.players[i];
        let piId: string | null = null;
        // Fechada: só o organizador paga a quadra; aberta: cada um paga a sua parte
        const payer = opt.open || i === 0;
        if (payer && !opt.pendingPayment) {
          const club = opt.open ? opt.courtPrice / 4 : opt.courtPrice;
          piId = await pay(gross(club), opt.mode, desc, { tipo, gameId: g.id });
        }
        await db.from('game_players').insert({
          game_id: g.id, player_id: pid, player_name: NAMES[pid], paid: !opt.pendingPayment && (payer || !opt.open),
          stripe_payment_intent_id: piId, ...(opt.sport === 'futevolei' ? { team: i % 2 === 0 ? 'a' : 'b' } : {}),
        });
      }
      log.push(`${desc} · ${opt.start.replace('T', ' ')} · ${n} jogador(es) · ${opt.mode}${opt.pendingPayment ? ' (aguardando pagamento)' : ''}`);
      return g.id;
    }

    // ── Day use / curso ────────────────────────────────────────────────────
    async function cls(opt: {
      kind: 'day_use' | 'course'; title: string; coach?: string; court: string; sport: string; price: number; capacity: number;
      sessions: [string, string][]; players: string[]; mode: PayMode;
    }) {
      const first = opt.sessions[0][0].substring(0, 10);
      const last = opt.sessions[opt.sessions.length - 1][0].substring(0, 10);
      const { data: c, error } = await db.from('classes').insert({
        venue_id: VENUE, court_id: opt.court, kind: opt.kind, title: opt.title, coach_name: opt.coach ?? '',
        level: 'todos', sport_type: opt.sport, capacity: opt.capacity, price: opt.price,
        lesson_count: opt.sessions.length, start_date: first, end_date: last, schedule_mode: 'custom',
        created_by: 'c4c6d4f4-a48d-4fff-8fb1-a722fddb9607',
      }).select('id').single();
      if (error) throw new Error(`classe ${opt.title}: ${error.message}`);
      for (const [s, e] of opt.sessions) {
        const { data: sess } = await db.from('class_sessions').insert({ class_id: c.id, starts_at: `${s}:00Z`, ends_at: `${e}:00Z` }).select('id').single();
        await db.rpc('class_block_session', { p_session_id: sess!.id, p_court_id: opt.court, p_start: `${s}:00Z`, p_end: `${e}:00Z` });
      }
      const tipo = opt.kind === 'day_use' ? 'day_use' : 'aula';
      for (const pid of opt.players) {
        const piId = await pay(gross(opt.price), opt.mode, `${opt.kind === 'day_use' ? 'Day use' : 'Curso'} — ${opt.title}`, { tipo, classId: c.id });
        await db.from('class_enrollments').insert({
          class_id: c.id, player_id: pid, amount_paid: opt.price, service_fee: Math.round((gross(opt.price) - opt.price) * 100) / 100,
          stripe_payment_intent_id: piId, payment_held: opt.mode === 'held', captured_at: opt.mode === 'paid' ? new Date().toISOString() : null,
        });
      }
      await db.from('classes').update({ enrolled_count: opt.players.length }).eq('id', c.id);
      log.push(`${opt.kind === 'day_use' ? 'Day use' : 'Curso'} — ${opt.title} · ${opt.players.length} inscrito(s) · ${opt.mode}`);
    }

    // ═════════ NOVEMBRO ═════════
    // Já realizadas (pagas)
    await game({ label: 'Society 1', court: SOCIETY, sport: 'society', start: '2026-11-02T19:00', end: '2026-11-02T20:30', open: false, courtPrice: 375, organizer: P.julio, players: [P.julio], mode: 'paid', status: 'completed' });
    await game({ label: 'Quadra de Areia 1', court: AREIA, sport: 'futevolei', start: '2026-11-03T18:00', end: '2026-11-03T19:30', open: true, courtPrice: 180, organizer: P.bia, players: [P.bia, P.julio, P.olivia, P.user], mode: 'paid', status: 'completed' });
    await game({ label: 'Futsal Coberta', court: FUTSAL, sport: 'futsal', start: '2026-11-05T20:00', end: '2026-11-05T21:30', open: false, courtPrice: 300, organizer: P.olivia, players: [P.olivia], mode: 'paid', status: 'completed' });
    await cls({ kind: 'day_use', title: 'Day use de sexta', court: AREIA, sport: 'futevolei', price: 40, capacity: 12,
      sessions: [['2026-11-06T10:00', '2026-11-06T14:00']], players: [P.julio, P.bia, P.olivia, P.user, P.aron], mode: 'paid' });
    // Cancelada com reembolso (o único reembolso do mês)
    await game({ label: 'Society 1', court: SOCIETY, sport: 'society', start: '2026-11-07T19:00', end: '2026-11-07T20:30', open: false, courtPrice: 375, organizer: P.bia, players: [P.bia], mode: 'refunded', status: 'cancelled', bookingStatus: 'cancelled' });

    // Próximas
    // amanhã à noite, 4/4 com valor retido → prazo de 24h já passou (será cobrado 2h antes)
    await game({ label: 'Quadra de Areia 1', court: AREIA, sport: 'futevolei', start: '2026-11-09T19:00', end: '2026-11-09T20:30', open: true, courtPrice: 180, organizer: P.julio, players: [P.julio, P.bia, P.user, P.olivia], mode: 'held', status: 'confirmed_booking' });
    await game({ label: 'Society 1', court: SOCIETY, sport: 'society', start: '2026-11-12T19:00', end: '2026-11-12T20:30', open: false, courtPrice: 375, organizer: P.julio, players: [P.julio], mode: 'held', status: 'confirmed_booking' });
    await cls({ kind: 'day_use', title: 'Day use de sábado', court: AREIA, sport: 'futevolei', price: 40, capacity: 12,
      sessions: [['2026-11-14T08:00', '2026-11-14T12:00']], players: [P.julio, P.olivia, P.aron], mode: 'held' });
    await game({ label: 'Futsal Coberta', court: FUTSAL, sport: 'futsal', start: '2026-11-15T10:00', end: '2026-11-15T11:30', open: false, courtPrice: 300, organizer: P.user, players: [P.user], mode: 'paid', status: 'confirmed_booking', pendingPayment: true });
    await cls({ kind: 'course', title: 'Futevôlei para iniciantes', coach: 'Marcelo', court: AREIA, sport: 'futevolei', price: 300, capacity: 6,
      sessions: [['2026-11-17T19:00', '2026-11-17T20:00'], ['2026-11-19T19:00', '2026-11-19T20:00'], ['2026-11-24T19:00', '2026-11-24T20:00'], ['2026-11-26T19:00', '2026-11-26T20:00']],
      players: [P.bia, P.user], mode: 'paid' });
    await game({ label: 'Quadra de Areia 1', court: AREIA, sport: 'futevolei', start: '2026-11-20T19:00', end: '2026-11-20T20:30', open: true, courtPrice: 180, organizer: P.olivia, players: [P.olivia, P.aron], mode: 'held', status: 'scheduled' });
    await cls({ kind: 'day_use', title: 'Day use de domingo', court: AREIA, sport: 'futevolei', price: 45, capacity: 12,
      sessions: [['2026-11-22T09:00', '2026-11-22T13:00']], players: [P.bia, P.user], mode: 'paid' });

    return json({ ok: true, created: log });
  } catch (e) {
    console.error('[staging-seed]', e);
    return json({ error: (e as Error).message, created: log }, 500);
  }
});
