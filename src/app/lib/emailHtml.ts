// Modelos de email em HTML puro (sem dependências): usados pelo site e pelo app.

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

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface ClassEmailDetails {
  title: string;
  coach: string;
  venueName: string;
  courtName: string;
  /** Uma linha por aula, ex.: "ter, 01/12 · 19:00–20:00" */
  sessions: string[];
  total: string;
  /** Partida aberta · Day use (sem professor, 1 data) */
  dayUse?: boolean;
  /** Valor só reservado no cartão (ainda não cobrado) */
  held?: boolean;
  /** Ex.: "sáb, 14/11 às 17:00" — quando o valor reservado é cobrado */
  chargeAt?: string;
  /** Ex.: "sex, 13/11 às 19:00" — limite para desistir sem custo */
  leaveUntil?: string;
  /** Cartão salvo (mais de 6 dias): quando o valor será reservado */
  holdOn?: string;
}

function classPaymentLines(d: ClassEmailDetails, color: string, start: string) {
  const amount = d.holdOn
    ? `<p style="margin:8px 0 0; font-weight:700; color:${color}; padding-top:8px; border-top:1px solid #e5e7eb;">Valor: R$ ${escapeHtml(d.total)} (nada cobrado ainda)</p>`
    : d.held
    ? `<p style="margin:8px 0 0; font-weight:700; color:${color}; padding-top:8px; border-top:1px solid #e5e7eb;">Reservado no cartão: R$ ${escapeHtml(d.total)}</p>`
    : `<p style="margin:8px 0 0; font-weight:700; color:${color}; padding-top:8px; border-top:1px solid #e5e7eb;">Pago: R$ ${escapeHtml(d.total)}</p>`;
  const when = d.holdOn
    ? `<p style="margin:0 0 8px; font-size:14px; line-height:1.6; color:#111827;"><b>Nada foi cobrado agora.</b> Seu cartão ficou salvo: em <b>${escapeHtml(d.holdOn)}</b> reservamos o valor no cartão, e ele é cobrado em <b>${escapeHtml(d.chargeAt ?? `2h antes ${start}`)}</b>. Se o banco recusar, avisamos e você tem 24h para pagar.</p>`
    : d.held
    ? `<p style="margin:0 0 8px; font-size:14px; line-height:1.6; color:#111827;">O valor fica <b>reservado no seu cartão</b> e só é cobrado em <b>${escapeHtml(d.chargeAt ?? `2h antes ${start}`)}</b> (2h antes ${start}).</p>`
    : '';
  const leave = `<p style="margin:0; font-size:13px; line-height:1.6; color:#6b7280;">Desistência sem custo até ${d.leaveUntil ? `<b>${escapeHtml(d.leaveUntil)}</b>` : `24h antes ${start}`}, pelo app${d.held ? ': a reserva é liberada no cartão' : ': reembolso total'}. Se o clube cancelar, você recebe tudo de volta.</p>`;
  return { amount, footer: when + leave };
}

export function classEnrolledEmail(d: ClassEmailDetails): string {
  const lessons = d.sessions
    .map((s, i) => `<p style="margin:0 0 4px; color:#4b5563;">Aula ${i + 1}: ${escapeHtml(s)}</p>`)
    .join('');
  if (d.dayUse) {
    return buildEmailHtml('Você está no day use — JoggaHub', `
    <h1 style="margin:0 0 12px; font-size:20px; font-weight:700; color:#111827;">Você está no day use!</h1>
    <p style="margin:0 0 24px; font-size:15px; line-height:1.6; color:#4b5563;">Sua vaga em <b>${escapeHtml(d.title)}</b> está garantida. Bom jogo!</p>
    <div style="background-color:#f9fafb; border-radius:12px; padding:16px 18px; margin:0 0 24px; font-size:14px;">
      <p style="margin:0 0 4px; font-weight:600; color:#111827;">${escapeHtml(d.venueName)} · ${escapeHtml(d.courtName)}</p>
      <p style="margin:0 0 4px; color:#4b5563;">${escapeHtml(d.sessions[0] ?? '')}</p>
      ${classPaymentLines(d, '#0284c7', 'do início').amount}
    </div>
    ${classPaymentLines(d, '#0284c7', 'do início').footer}
  `);
  }
  return buildEmailHtml('Inscrição confirmada — JoggaHub', `
    <h1 style="margin:0 0 12px; font-size:20px; font-weight:700; color:#111827;">Inscrição confirmada!</h1>
    <p style="margin:0 0 24px; font-size:15px; line-height:1.6; color:#4b5563;">Sua vaga está garantida em todas as aulas do curso <b>${escapeHtml(d.title)}</b>, com Prof. ${escapeHtml(d.coach)}.</p>
    <div style="background-color:#f9fafb; border-radius:12px; padding:16px 18px; margin:0 0 24px; font-size:14px;">
      <p style="margin:0 0 4px; font-weight:600; color:#111827;">${escapeHtml(d.venueName)} · ${escapeHtml(d.courtName)}</p>
      <div style="margin:8px 0 0;">${lessons}</div>
      ${classPaymentLines(d, '#7c3aed', 'da primeira aula').amount}
    </div>
    ${classPaymentLines(d, '#7c3aed', 'da primeira aula').footer}
  `);
}
