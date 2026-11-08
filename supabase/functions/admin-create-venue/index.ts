// Administração: cadastra uma arena nova de uma vez — conta do gestor, clube,
// quadras e regra de repasse. Só administradores do JoggaHub.
//
// Se o email do gestor ainda não tem conta, cria com uma senha inicial gerada
// aqui (devolvida UMA vez para o admin repassar ao gestor). Se já tem conta e
// ela não administra outro clube, usa essa conta.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/checkout.ts';

const SPORTS = ['futevolei', 'society', 'futsal', 'football'];

function tempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);
    const userClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } });
    const { data: isAdmin } = await userClient.rpc('is_platform_admin');
    if (isAdmin !== true) return json({ error: 'Acesso restrito à administração do JoggaHub.' }, 403);

    const body = await req.json().catch(() => ({}));
    const name = String(body.name ?? '').trim();
    const gestorEmail = String(body.gestorEmail ?? '').trim().toLowerCase();
    const gestorName = String(body.gestorName ?? '').trim() || name;
    const courts = Array.isArray(body.courts) ? body.courts : [];
    if (name.length < 3) return json({ error: 'Dê um nome à arena.' }, 400);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(gestorEmail)) return json({ error: 'Email do gestor inválido.' }, 400);
    if (!courts.length) return json({ error: 'Cadastre pelo menos uma quadra.' }, 400);
    for (const c of courts) {
      if (String(c.name ?? '').trim().length < 2) return json({ error: 'Toda quadra precisa de um nome.' }, 400);
      if (!SPORTS.includes(c.sport_type)) return json({ error: 'Modalidade de quadra inválida.' }, 400);
    }

    const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    // 1. Conta do gestor
    let userId: string | null = null;
    let password: string | null = null;
    const { data: existing } = await db.rpc('admin_find_user_by_email', { p_email: gestorEmail });
    if (existing) {
      userId = existing as string;
      const { data: other } = await db.from('venues').select('id, name').eq('admin_id', userId).maybeSingle();
      if (other) return json({ error: `Esse email já é gestor da arena "${other.name}".` }, 400);
    } else {
      password = tempPassword();
      const { data: created, error } = await db.auth.admin.createUser({
        email: gestorEmail, password, email_confirm: true, user_metadata: { name: gestorName },
      });
      if (error || !created.user) return json({ error: `Não foi possível criar a conta do gestor: ${error?.message ?? ''}` }, 400);
      userId = created.user.id;
    }
    await db.from('profiles').update({ role: 'venue_admin', name: gestorName }).eq('id', userId);

    // 2. Arena
    const { data: venue, error: vErr } = await db.from('venues').insert({
      name, admin_id: userId,
      city: body.city ?? null, address: body.address ?? null, phone: body.phone ?? null,
      email: body.email ?? gestorEmail, description: body.description ?? null,
    }).select('id').single();
    if (vErr || !venue) return json({ error: `Erro ao criar a arena: ${vErr?.message ?? ''}` }, 400);

    // 3. Quadras
    const { error: cErr } = await db.from('courts').insert(courts.map((c: Record<string, unknown>) => ({
      venue_id: venue.id, name: String(c.name).trim(), sport_type: c.sport_type,
      price_per_hour: Number(c.price_per_hour) || 0, is_active: true,
    })));
    if (cErr) return json({ error: `Arena criada, mas houve erro nas quadras: ${cErr.message}` }, 400);

    // 4. Regra de repasse e dados bancários
    await db.from('venue_payout_settings').upsert({
      venue_id: venue.id, schedule: body.schedule === 'weekly' ? 'weekly' : 'per_game',
      pix_key: body.pixKey ?? null, account_holder: body.accountHolder ?? null, document: body.document ?? null,
    });

    return json({ ok: true, venueId: venue.id, gestorEmail, tempPassword: password, existingAccount: !password });
  } catch (e) {
    console.error('[admin-create-venue]', e);
    return json({ error: (e as Error).message ?? 'Erro ao cadastrar arena' }, 500);
  }
});
