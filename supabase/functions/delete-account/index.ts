// Deletes the caller's account (App Store 5.1.1(v) / Google Play: deletion must
// be possible inside the app).
//
// Refused while the account still has something in progress that involves other
// people or money: active games (as organizer or player), upcoming bookings, an
// active club membership, or a club it administers. The user is told what to do.
//
// Otherwise:
//   - no history  → the auth user is deleted (cascades to the profile);
//   - has history → personal data is erased and the login is disabled forever
//     (games, bookings and results reference the user, so past games of other
//     players stay correct with the name "Usuário removido").
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { UserError, corsHeaders, json } from '../_shared/checkout.ts';

const REMOVED_NAME = 'Usuário removido';
const ACTIVE_GAME = ['scheduled', 'confirmed_booking', 'pending_results'];

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);
    const userId = user.id;

    const { confirm } = await req.json().catch(() => ({}));
    if (confirm !== true) throw new UserError('Confirmação obrigatória.');

    const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    // ── What still needs to be closed first ──
    const blockers: string[] = [];

    const { count: venues } = await db.from('venues').select('id', { count: 'exact', head: true }).eq('admin_id', userId);
    if (venues) blockers.push('Você administra um clube no JoggaHub. Fale com o suporte (info@joggahub.com) para transferir ou encerrar o clube.');

    const { count: organized } = await db.from('games').select('id', { count: 'exact', head: true })
      .eq('organizer_id', userId).in('status', ACTIVE_GAME);
    if (organized) blockers.push(`Você organiza ${organized} partida(s) em andamento. Cancele-as ou saia delas antes.`);

    const { data: enrolled } = await db.from('game_players').select('game_id, games!inner(status, organizer_id)')
      .eq('player_id', userId).in('games.status', ACTIVE_GAME);
    const asPlayer = (enrolled ?? []).filter((r: any) => r.games?.organizer_id !== userId).length;
    if (asPlayer) blockers.push(`Você está inscrito em ${asPlayer} partida(s) em andamento. Saia delas antes.`);

    const { data: bookings } = await db.from('bookings').select('id, slots(start_time)')
      .eq('created_by', userId).eq('status', 'confirmed');
    const upcoming = (bookings ?? []).filter((b: any) => {
      const start = b.slots?.start_time;
      return !start || new Date(start).getTime() > Date.now() - 3 * 3600_000;
    }).length;
    if (upcoming) blockers.push(`Você tem ${upcoming} reserva(s) ativa(s). Cancele-as em Minhas Reservas antes.`);

    const { count: plans } = await db.from('memberships').select('id', { count: 'exact', head: true })
      .eq('player_id', userId).in('status', ['pending', 'active', 'past_due']);
    if (plans) blockers.push('Você tem um plano de clube ativo. Cancele o plano antes.');

    if (blockers.length) return json({ error: 'Antes de excluir sua conta:', blockers }, 409);

    // ── Erase personal data (both paths) ──
    const { data: files } = await db.storage.from('avatars').list(userId);
    if (files?.length) await db.storage.from('avatars').remove(files.map((f: { name: string }) => `${userId}/${f.name}`));

    await db.from('follows').delete().or(`follower_id.eq.${userId},following_id.eq.${userId}`);
    await db.from('notifications').delete().eq('user_id', userId);

    // ── Delete outright when nothing references the user ──
    const { error: delErr } = await db.auth.admin.deleteUser(userId);
    if (!delErr) return json({ deleted: true, mode: 'deleted' });

    // ── Has history: anonymize and disable the login ──
    const { error: profErr } = await db.from('profiles').update({
      name: REMOVED_NAME, phone: null, avatar_url: null, location: null, bio: null,
      preferred_position: null, dominant_foot: null, availability: null, skill_level: null,
      updated_at: new Date().toISOString(),
    }).eq('id', userId);
    if (profErr) throw new Error(profErr.message);
    await db.from('game_players').update({ player_name: REMOVED_NAME }).eq('player_id', userId);
    await db.from('booking_players').update({ email: null }).eq('user_id', userId);

    const randomPassword = crypto.randomUUID() + crypto.randomUUID();
    const { error: updErr } = await db.auth.admin.updateUserById(userId, {
      email: `excluido+${userId}@joggahub.com.br`,
      email_confirm: true,
      phone: '',
      password: randomPassword,
      user_metadata: {},
      ban_duration: '876000h', // ~100 years
    });
    if (updErr) throw new Error(updErr.message);
    // End every session (refresh tokens) right away.
    await db.auth.admin.signOut(authHeader.replace(/^Bearer\s+/i, ''), 'global').catch(() => {});

    return json({ deleted: true, mode: 'anonymized' });
  } catch (error) {
    if (!(error instanceof UserError)) console.error('[delete-account]', error);
    return json({ error: error instanceof Error ? error.message : 'Erro ao excluir conta' }, 400);
  }
});
