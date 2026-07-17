import { supabase } from '@/lib/supabase';

/** Fire-and-forget — a failed email should never block the booking flow. */
export async function sendEmail(to: string, subject: string, html: string) {
  try {
    await supabase.functions.invoke('send-notification-email', { body: { to, subject, html } });
  } catch (e) {
    console.error('[sendEmail] failed:', e);
  }
}

/** Wraps inner content in the branded JoggaHub email shell. */
export function buildEmailHtml(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
</head>
<body style="margin:0; padding:0; background-color:#f9fafb; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#7c3aed,#6d28d9); padding:32px 32px 28px; text-align:center;">
              <div style="font-size:28px; margin-bottom:4px;">⚽</div>
              <div style="color:#ffffff; font-size:20px; font-weight:700; letter-spacing:-0.02em;">JoggaHub</div>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 32px 32px;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px; background-color:#f9fafb; border-top:1px solid #f0f0f0;" align="center">
              <p style="margin:0; font-size:12px; color:#9ca3af;">JoggaHub · Reserve quadras e monte sua partida</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

interface BookingDetails {
  courtName?: string;
  venueName?: string;
  date?: string;
  time?: string;
  endTime?: string;
  price?: string;
}

function detailsBlock({ courtName, venueName, date, time, endTime, price }: BookingDetails): string {
  const rows = [
    courtName && `<p style="margin:0 0 4px; font-weight:600; color:#111827;">${courtName}</p>`,
    venueName && `<p style="margin:0 0 4px; color:#6b7280;">${venueName}</p>`,
    (date || time) && `<p style="margin:0 0 4px; color:#4b5563;">${date ?? ''}${date && time ? ' · ' : ''}${time ?? ''}${endTime ? ` – ${endTime}` : ''}</p>`,
    price && `<p style="margin:8px 0 0; font-weight:700; color:#7c3aed; padding-top:8px; border-top:1px solid #e5e7eb;">R$ ${price}</p>`,
  ].filter(Boolean).join('');

  if (!rows) return '';
  return `<div style="background-color:#f9fafb; border-radius:12px; padding:16px 18px; margin:0 0 24px; font-size:14px;">${rows}</div>`;
}

export function bookingConfirmedEmail(bodyText: string, details: BookingDetails): string {
  return buildEmailHtml('Reserva confirmada — JoggaHub', `
    <h1 style="margin:0 0 12px; font-size:20px; font-weight:700; color:#111827;">Reserva confirmada!</h1>
    <p style="margin:0 0 24px; font-size:15px; line-height:1.6; color:#4b5563;">${bodyText}</p>
    ${detailsBlock(details)}
  `);
}

export function bookingCancelledEmail(bodyText: string, details: BookingDetails): string {
  return buildEmailHtml('Reserva cancelada — JoggaHub', `
    <h1 style="margin:0 0 12px; font-size:20px; font-weight:700; color:#111827;">Reserva cancelada</h1>
    <p style="margin:0 0 24px; font-size:15px; line-height:1.6; color:#4b5563;">${bodyText}</p>
    ${detailsBlock(details)}
  `);
}
