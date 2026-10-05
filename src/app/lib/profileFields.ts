/**
 * Player profile fields shared by Onboarding, EditProfile, Profile and
 * PublicProfile: options/labels (values must match the profiles CHECK
 * constraints — dominant_foot ∈ right/left/both) and the completeness check.
 */

export const POSITION_OPTIONS = [
  { value: 'right', label: 'Lado direito', emoji: '➡️' },
  { value: 'left', label: 'Lado esquerdo', emoji: '⬅️' },
  { value: 'both', label: 'Qualquer lado', emoji: '🔄' },
];

export const FOOT_OPTIONS = [
  { value: 'right', label: 'Destro', emoji: '🦶' },
  { value: 'left', label: 'Canhoto', emoji: '🦶' },
  { value: 'both', label: 'Ambidestro', emoji: '⚡' },
];

export const DAY_OPTIONS = [
  { value: 'mon', label: 'Seg' },
  { value: 'tue', label: 'Ter' },
  { value: 'wed', label: 'Qua' },
  { value: 'thu', label: 'Qui' },
  { value: 'fri', label: 'Sex' },
  { value: 'sat', label: 'Sáb' },
  { value: 'sun', label: 'Dom' },
];

export const PERIOD_OPTIONS = [
  { value: 'morning', label: 'Manhã', sub: '06h–12h' },
  { value: 'afternoon', label: 'Tarde', sub: '12h–18h' },
  { value: 'evening', label: 'Noite', sub: '18h–23h' },
];

const toMap = (opts: { value: string; label: string }[]) => Object.fromEntries(opts.map(o => [o.value, o.label]));
export const POSITION_LABELS: Record<string, string> = toMap(POSITION_OPTIONS);
export const FOOT_LABELS: Record<string, string> = toMap(FOOT_OPTIONS);
export const DAY_LABELS: Record<string, string> = toMap(DAY_OPTIONS);
export const PERIOD_LABELS: Record<string, string> = toMap(PERIOD_OPTIONS);

/** Sections of the edit screen (also used as ?section= deep links). */
export type ProfileSection = 'identidade' | 'cidade' | 'jogo' | 'disponibilidade' | 'bio';

interface CompletenessInput {
  name: string | null;
  avatar_url: string | null;
  location: string | null;
  preferred_position: string | null;
  dominant_foot: string | null;
  availability: { days?: string[]; periods?: string[] } | null;
}

/** What makes a profile "complete". Bio is optional and doesn't count. */
export function profileCompleteness(p: CompletenessInput | null | undefined) {
  const items: { key: string; label: string; section: ProfileSection; done: boolean }[] = [
    { key: 'avatar', label: 'Foto', section: 'identidade', done: !!p?.avatar_url },
    { key: 'name', label: 'Nome', section: 'identidade', done: !!p?.name?.trim() },
    { key: 'location', label: 'Cidade', section: 'cidade', done: !!p?.location?.trim() },
    { key: 'position', label: 'Posição', section: 'jogo', done: !!p?.preferred_position },
    { key: 'foot', label: 'Pé dominante', section: 'jogo', done: !!p?.dominant_foot },
    {
      key: 'availability', label: 'Dias e horários', section: 'disponibilidade',
      done: (p?.availability?.days?.length ?? 0) > 0 && (p?.availability?.periods?.length ?? 0) > 0,
    },
  ];
  const done = items.filter(i => i.done).length;
  return {
    items,
    missing: items.filter(i => !i.done),
    done,
    total: items.length,
    pct: Math.round((done / items.length) * 100),
    complete: done === items.length,
  };
}

/** City name from the browser's location (OpenStreetMap reverse geocoding). */
export function detectCity(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalização não suportada pelo seu navegador.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json&accept-language=pt-BR`,
            { headers: { 'User-Agent': 'JoggaHub/1.0' } },
          );
          const data = await res.json();
          const city = data.address?.city || data.address?.town || data.address?.village || data.address?.municipality || '';
          const state = data.address?.state_code || data.address?.state || '';
          const label = city && state ? `${city}, ${state}` : city || state;
          if (label) resolve(label);
          else reject(new Error('Não foi possível identificar sua cidade.'));
        } catch {
          reject(new Error('Não foi possível identificar sua cidade.'));
        }
      },
      () => reject(new Error('Permissão de localização negada.')),
      { timeout: 8000 },
    );
  });
}
