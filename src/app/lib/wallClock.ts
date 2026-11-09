/**
 * Game/slot timestamps are stored as the club's wall-clock time (the time the
 * user picked, saved without a timezone — see the timezone note in the project
 * docs). Formatting them with new Date().toLocale*() converts to the viewer's
 * timezone and shifts them (−3h in Brazil, +1h in Ireland), so read the raw
 * text instead, like the rest of the app does with substring(11, 16).
 */

/**
 * "Agora" em Brasília na mesma convenção dos horários gravados, em ms.
 * Compare horários de partida/slot com isto, NUNCA com Date.now(): o relógio
 * UTC está 3h à frente e tudo aconteceria 3h antes do prometido.
 */
export function wallNowMs() {
  return realToWallMs(Date.now());
}

/** Um instante real (ms, ex.: Date.now()) no relógio de Brasília (wall clock). */
export function realToWallMs(ms: number) {
  const s = new Date(ms).toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(' ', 'T');
  return Date.parse(`${s}Z`);
}

/** "Agora" de Brasília no formato dos horários gravados, para filtros .gte('scheduled_at', …). */
export const wallNowIso = () => new Date(wallNowMs()).toISOString();

/** Horário gravado (wall clock) em ms, sem conversão de fuso. */
export const wallMs = (iso: string) => Date.parse(`${iso.substring(0, 19)}Z`);

/**
 * "Agora" como Date cujos campos locais (getHours, getDate…) são a hora de
 * Brasília, qualquer que seja o fuso do computador. Use no lugar de new Date()
 * quando a tela precisa de "agora"/"hoje" do clube (agenda, calendário, prazos).
 */
export function brNow(): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return new Date(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
}

/** "HH:MM" exactly as stored. */
export function wallTime(iso: string) {
  return iso.substring(11, 16);
}

/** Date part formatted in pt-BR without any timezone shift (noon avoids DST/offset edge cases). */
export function wallDate(iso: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  return new Date(`${iso.substring(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', options);
}
