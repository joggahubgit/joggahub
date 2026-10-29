import { wallDate, wallTime } from './shared';

/** Same labels as the web app (FindGames/OpenGamePage). */
const SPORT_LABELS: Record<string, string> = {
  football: 'Society',
  society: 'Society',
  futsal: 'Futsal',
  futevolei: 'Futevôlei',
  tennis: 'Tênis',
  padel: 'Padel',
  basketball: 'Basquete',
  volleyball: 'Vôlei',
  beach_tennis: 'Beach Tennis',
};

export function sportLabel(sport: string | null | undefined) {
  return SPORT_LABELS[sport ?? ''] ?? 'Partida';
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export function formatBRL(value: number | null | undefined) {
  return brl.format(Number(value ?? 0));
}

/** "sáb., 1 de nov. · 19:00" — wall-clock, never shifted by the device timezone. */
export function gameWhen(iso: string | null | undefined, endIso?: string | null) {
  if (!iso) return '—';
  const date = wallDate(iso, { weekday: 'short', day: 'numeric', month: 'short' });
  const end = endIso ? ` – ${wallTime(endIso)}` : '';
  return `${date} · ${wallTime(iso)}${end}`;
}

/** Relative "há 5 min" style label for notifications/feed (real instants, not wall-clock). */
export function timeAgo(iso: string) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
}

export function initials(name: string | null | undefined) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
