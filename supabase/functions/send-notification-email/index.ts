import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Sends a transactional email (booking confirmation etc.) to the signed-in
// user. The recipient must be the caller's own email: without that check this
// was an open relay — anyone with the public anon key could send any HTML to
// anyone as confirmacao@joggahub.com.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user?.email) return json({ error: 'Unauthorized' }, 401);

    const { to, subject, html } = await req.json();
    if (!to || !subject || !html) {
      throw new Error('to, subject and html are required');
    }
    if (String(to).trim().toLowerCase() !== user.email.toLowerCase()) {
      return json({ error: 'Só é possível enviar email para a sua própria conta.' }, 403);
    }
    if (String(subject).length > 200 || String(html).length > 100_000) {
      throw new Error('Email muito grande');
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY') ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'JoggaHub <confirmacao@joggahub.com>',
        to: user.email,
        subject,
        html,
      }),
    });

    const data = await resendRes.json();
    if (!resendRes.ok) {
      console.error('[send-notification-email] Resend error:', data);
      return json({ error: data }, 500);
    }

    return json({ success: true, id: data.id });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 400);
  }
});
