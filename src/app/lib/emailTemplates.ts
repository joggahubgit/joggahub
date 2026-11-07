import { supabase } from '@/lib/supabase';
import { buildEmailHtml } from './emailHtml';

export { buildEmailHtml, classEnrolledEmail } from './emailHtml';

/** Fire-and-forget — a failed email should never block the booking flow. */
export async function sendEmail(to: string, subject: string, html: string) {
  try {
    await supabase.functions.invoke('send-notification-email', { body: { to, subject, html } });
  } catch (e) {
    console.error('[sendEmail] failed:', e);
  }
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
