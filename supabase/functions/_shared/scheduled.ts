// Cartão salvo + retenção automática 6 dias antes.
//
// A retenção (captura manual) do Stripe dura ~7 dias. Para reservas com mais de
// 6 dias de antecedência o Checkout só SALVA o cartão (modo setup) e a vaga já
// fica garantida; a função process-scheduled-payments retém o valor 6 dias antes
// do início e, dali em diante, tudo segue igual a uma retenção feita na hora.

import Stripe from 'https://esm.sh/stripe@14.21.0';
import { METADATA_VERSION, checkoutExpiresAt } from './checkout.ts';

// deno-lint-ignore no-explicit-any
type Db = any;

export const HOLD_DAYS_BEFORE = 6;
/** Prazo para o jogador pagar quando o banco recusa a retenção automática. */
export const RETRY_HOURS = 24;

/** "Agora" em Brasília na convenção dos horários gravados (wall clock). */
export function wallNowMs() {
  const s = new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(' ', 'T');
  return new Date(`${s}Z`).getTime();
}
export const wallMs = (iso: string) => Date.parse(`${iso.substring(0, 19)}Z`);
export const wallIso = (ms: number) => new Date(ms).toISOString().substring(0, 19);

/** Mais de 6 dias até o início: agora só salva o cartão. */
export const shouldSchedule = (startIso: string) =>
  wallMs(startIso) - wallNowMs() > HOLD_DAYS_BEFORE * 24 * 3600_000;

export const holdAtFor = (startIso: string) => wallIso(wallMs(startIso) - HOLD_DAYS_BEFORE * 24 * 3600_000);

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
/** "sáb, 14/11 às 17:00" — horário gravado (wall clock) menos N horas. */
export function wallLabelMinus(iso: string, minusHours = 0) {
  const d = new Date(wallMs(iso) - minusHours * 3600_000);
  const s = d.toISOString();
  return `${WEEKDAYS[d.getUTCDay()]}, ${s.substring(8, 10)}/${s.substring(5, 7)} às ${s.substring(11, 16)}`;
}

export const brl = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`;

/** Cliente Stripe do usuário (criado na primeira vez). Só o servidor conhece o id. */
export async function customerFor(stripe: Stripe, db: Db, userId: string): Promise<string> {
  const { data: row } = await db.from('stripe_customers').select('customer_id').eq('user_id', userId).maybeSingle();
  if (row?.customer_id) return row.customer_id;
  const { data: u } = await db.auth.admin.getUserById(userId);
  const customer = await stripe.customers.create(
    { email: u?.user?.email ?? undefined, metadata: { userId } },
    { idempotencyKey: `customer-${userId}` },
  );
  const { error } = await db.from('stripe_customers').insert({ user_id: userId, customer_id: customer.id });
  if (error && error.code === '23505') {
    const { data: again } = await db.from('stripe_customers').select('customer_id').eq('user_id', userId).single();
    return again.customer_id;
  }
  if (error) throw new Error(`stripe_customers: ${error.message}`);
  return customer.id;
}

export interface ScheduledCheckout {
  userId: string;
  customer: string;
  /** Valor total que será retido (com a taxa). */
  amount: number;
  startIso: string;
  /** Ex.: "cobrado 2h antes da partida" */
  chargeText: string;
  /** Horas antes do início até quando dá para desistir sem custo. */
  leaveHours: number;
  /** Aparece no extrato do Stripe e na retenção. */
  description: string;
  /** Metadata da futura retenção (tipo, gameId/classId…). */
  piMetadata: Record<string, string>;
  /** Metadata da sessão (kind e dados para criar a reserva). */
  metadata: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
}

/** Checkout que só salva o cartão. O valor e as datas aparecem acima do botão. */
export function scheduledCheckoutParams(c: ScheduledCheckout): Stripe.Checkout.SessionCreateParams {
  const holdAt = holdAtFor(c.startIso);
  const message =
    `Nada é cobrado agora: seu cartão fica salvo e a vaga garantida. ` +
    `Em ${wallLabelMinus(c.startIso, HOLD_DAYS_BEFORE * 24)} vamos reservar ${brl(c.amount)} no cartão (${c.chargeText}). ` +
    `Desistência sem custo até ${wallLabelMinus(c.startIso, c.leaveHours)}.`;
  return {
    mode: 'setup',
    locale: 'pt-BR',
    payment_method_types: ['card'],
    currency: 'brl',
    customer: c.customer,
    client_reference_id: c.userId,
    expires_at: checkoutExpiresAt(),
    setup_intent_data: { description: c.description, metadata: { ...c.piMetadata, agendado: '1' } },
    custom_text: { submit: { message } },
    metadata: {
      v: METADATA_VERSION,
      userId: c.userId,
      ...c.metadata,
      scheduled: '1',
      amount: c.amount.toFixed(2),
      description: c.description.substring(0, 300),
      startsAt: c.startIso.substring(0, 19),
      holdAt,
      piMeta: JSON.stringify(c.piMetadata),
    },
    success_url: c.successUrl,
    cancel_url: c.cancelUrl,
  };
}

// ── Operações sobre um pagamento agendado (process-scheduled-payments e "Pagar agora") ──

// deno-lint-ignore no-explicit-any
export type ScheduledPayment = any;

const ACTIVE_GAME = ['scheduled', 'confirmed_booking'];

/** A reserva ainda existe? (o jogador pode ter saído, a partida ou o curso cancelado) */
export async function targetAlive(db: Db, sp: ScheduledPayment): Promise<boolean> {
  if (sp.kind === 'class_enrollment') {
    const { data: e } = await db.from('class_enrollments').select('status, classes(status)')
      .eq('id', sp.class_enrollment_id).maybeSingle();
    return e?.status === 'active' && e?.classes?.status === 'active';
  }
  const { data: g } = await db.from('games').select('status, organizer_id').eq('id', sp.game_id).maybeSingle();
  if (!g || !ACTIVE_GAME.includes(g.status)) return false;
  if ((sp.kind === 'private_game' || sp.kind === 'organizer') && g.organizer_id !== sp.user_id) return false;
  const { data: gp } = await db.from('game_players').select('id')
    .eq('game_id', sp.game_id).eq('player_id', sp.player_id ?? sp.user_id).maybeSingle();
  return !!gp;
}

/**
 * Grava a retenção onde as cobranças (2h/24h antes) já procuram. Só vale se o
 * agendamento ainda estiver em `fromStatus` (evita corrida com o prazo vencendo).
 */
export async function attachHold(db: Db, sp: ScheduledPayment, piId: string, fromStatus: 'scheduled' | 'failed'): Promise<boolean> {
  const { data: won } = await db.from('scheduled_payments').update({
    status: 'held', payment_intent_id: piId, error: null, updated_at: new Date().toISOString(),
  }).eq('id', sp.id).eq('status', fromStatus).select('id');
  if (!won?.length) return false;
  if (sp.kind === 'private_game' || sp.kind === 'organizer') {
    await db.from('games').update({ organizer_payment_intent_id: piId }).eq('id', sp.game_id);
  } else if (sp.kind === 'join') {
    await db.from('game_players').update({ stripe_payment_intent_id: piId })
      .eq('game_id', sp.game_id).eq('player_id', sp.player_id);
  } else {
    await db.from('class_enrollments').update({ stripe_payment_intent_id: piId, payment_held: true })
      .eq('id', sp.class_enrollment_id);
  }
  return true;
}

async function freeSlots(db: Db, game: { id: string; slot_id: string | null; court_id: string; scheduled_at: string; scheduled_end_at: string | null }) {
  if (!game.slot_id) return;
  const start = game.scheduled_at.substring(0, 19);
  const end = (game.scheduled_end_at ?? game.scheduled_at).substring(0, 19);
  const { data: rangeSlots } = await db.from('slots').select('id, start_time')
    .eq('court_id', game.court_id).gte('start_time', start).lt('start_time', end);
  // Nunca libera horário de outra partida ativa no mesmo intervalo
  const { data: others } = await db.from('games').select('id, scheduled_at, scheduled_end_at')
    .eq('court_id', game.court_id).not('status', 'in', '("cancelled","expired","completed")')
    .lt('scheduled_at', end).gte('scheduled_at', wallIso(wallMs(start) - 6 * 3600_000));
  const taken = (others ?? []).filter((o: { id: string }) => o.id !== game.id)
    .map((o: { scheduled_at: string; scheduled_end_at: string | null }) =>
      [o.scheduled_at.substring(0, 19), (o.scheduled_end_at ?? o.scheduled_at).substring(0, 19)]);
  const ids = (rangeSlots ?? [])
    .filter((s: { id: string; start_time: string }) => {
      const t = s.start_time.substring(0, 19);
      return s.id === game.slot_id || !taken.some(([a, b]: string[]) => t >= a && (t < b || t === a));
    })
    .map((s: { id: string }) => s.id);
  if (ids.length) await db.from('slots').update({ is_available: true }).in('id', ids);
}

/**
 * Prazo do "Pagar agora" acabou: a vaga é cancelada. Retorna o texto para o
 * clube (ou null se não havia mais nada a cancelar).
 */
export async function cancelTarget(stripe: Stripe, db: Db, sp: ScheduledPayment): Promise<string | null> {
  if (sp.kind === 'class_enrollment') {
    const { data: e } = await db.from('class_enrollments').select('id, class_id, status').eq('id', sp.class_enrollment_id).maybeSingle();
    if (!e || e.status !== 'active') return null;
    await db.from('class_enrollments').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', e.id);
    const { data: c } = await db.from('classes').select('enrolled_count, title').eq('id', e.class_id).single();
    await db.from('classes').update({ enrolled_count: Math.max((c?.enrolled_count ?? 1) - 1, 0) }).eq('id', e.class_id);
    return `A inscrição em "${c?.title ?? 'curso'}" foi cancelada: o pagamento não foi concluído.`;
  }

  const { data: g } = await db.from('games')
    .select('id, status, is_open, organizer_id, booking_id, slot_id, court_id, scheduled_at, scheduled_end_at, sport_type')
    .eq('id', sp.game_id).maybeSingle();
  if (!g || !ACTIVE_GAME.includes(g.status)) return null;
  const who = sp.player_id ?? sp.user_id;

  // Partida fechada (quadra inteira) sem pagamento: cancela a reserva e libera o horário
  if (sp.kind === 'private_game') {
    await db.from('games').update({ status: 'cancelled' }).eq('id', g.id).in('status', ACTIVE_GAME);
    if (g.booking_id) await db.from('bookings').update({ status: 'cancelled' }).eq('id', g.booking_id);
    await freeSlots(db, g);
    const { data: players } = await db.from('game_players').select('player_id, stripe_payment_intent_id').eq('game_id', g.id);
    for (const p of players ?? []) {
      if (p.stripe_payment_intent_id) {
        try { await stripe.paymentIntents.cancel(p.stripe_payment_intent_id); } catch (e) {
          console.error('[scheduled] RELEASE FAILED — liberar manualmente', p.stripe_payment_intent_id, e);
        }
      }
    }
    const others = (players ?? []).map((p: { player_id: string }) => p.player_id).filter((id: string) => id && id !== who);
    if (others.length) {
      await db.from('notifications').insert(others.map((id: string) => ({
        user_id: id, type: 'game_cancelled', title: 'Partida cancelada',
        message: 'A reserva da quadra foi cancelada porque o pagamento do organizador não foi concluído. Nada foi cobrado de você.',
        game_id: g.id,
      })));
    }
    return 'Uma partida fechada foi cancelada e o horário liberado: o pagamento do organizador não foi concluído.';
  }

  // Organizador de partida aberta: passa a organização adiante, ou cancela se estiver sozinho
  if (sp.kind === 'organizer' && g.organizer_id === who) {
    const { data: roster } = await db.from('game_players').select('player_id, joined_at')
      .eq('game_id', g.id).neq('player_id', who).order('joined_at', { ascending: true });
    const next = (roster ?? []).find((p: { player_id: string | null }) => !!p.player_id);
    await db.from('game_players').delete().eq('game_id', g.id).eq('player_id', who);
    if (!next) {
      await db.from('games').update({ status: 'cancelled', is_open: false }).eq('id', g.id).in('status', ACTIVE_GAME);
      if (g.slot_id) await db.from('slots').update({ is_available: true }).eq('id', g.slot_id);
      return 'Uma partida aberta foi cancelada e o horário liberado: o pagamento do organizador não foi concluído.';
    }
    await db.from('games').update({ organizer_id: next.player_id, stripe_session_id: null, organizer_payment_intent_id: null }).eq('id', g.id);
    await db.from('notifications').insert({
      user_id: next.player_id, type: 'organizer_transferred', title: 'Você é o novo organizador!',
      message: 'O organizador anterior saiu da partida. Você agora é o responsável pela partida.', game_id: g.id,
    });
  } else {
    await db.from('game_players').delete().eq('game_id', g.id).eq('player_id', who);
  }

  // Recontagem (como em leave-game): partida aberta abaixo do mínimo volta a aceitar jogadores
  const { count } = await db.from('game_players').select('id', { count: 'exact', head: true }).eq('game_id', g.id);
  const total = count ?? 0;
  const min = ({ football: 10, society: 10, futsal: 10, futevolei: 4 } as Record<string, number>)[g.sport_type ?? ''] ?? 4;
  await db.from('games').update({
    current_players: total,
    ...(g.is_open && g.status === 'confirmed_booking' && total < min ? { status: 'scheduled' } : {}),
  }).eq('id', g.id);
  return 'Um jogador perdeu a vaga numa partida: o pagamento não foi concluído.';
}

// ── Avisos ───────────────────────────────────────────────────────────────────

export const siteUrl = () => (Deno.env.get('SITE_URL') ?? 'https://joggahub.com.br').replace(/\/$/, '');

/** Email transacional pelo servidor (Resend). Falhar nunca interrompe o fluxo. */
export async function sendServerEmail(db: Db, userId: string, subject: string, title: string, bodyHtml: string) {
  try {
    const key = Deno.env.get('RESEND_API_KEY');
    if (!key) return;
    const { data: u } = await db.auth.admin.getUserById(userId);
    const to = u?.user?.email;
    if (!to) return;
    const html = `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;">
<tr><td style="background:#7c3aed;padding:20px 24px;border-radius:16px 16px 0 0;color:#ffffff;font-size:20px;font-weight:700;">JoggaHub</td></tr>
<tr><td style="padding:24px;">
<h1 style="margin:0 0 12px;font-size:20px;color:#111827;">${title}</h1>
${bodyHtml}
</td></tr></table>
<p style="font-size:12px;color:#9ca3af;margin:16px 0 0;">JoggaHub · Reserve quadras e monte sua partida</p>
</td></tr></table></body></html>`;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'JoggaHub <confirmacao@joggahub.com>', to, subject, html }),
    });
    if (!res.ok) console.error('[scheduled] email falhou', res.status, await res.text());
  } catch (e) {
    console.error('[scheduled] email falhou', e);
  }
}
