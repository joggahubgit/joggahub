/**
 * Aulas (cursos) no app: mesmas consultas e regras do site
 * (src/app/components/classes/*). A inscrição é criada pelo servidor depois do
 * pagamento; o app só lê e chama as funções.
 */
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { CLASSES_ENABLED } from '@/lib/features';

export interface ClassCard {
  id: string;
  title: string;
  coach_name: string;
  level: string;
  capacity: number;
  enrolled_count: number;
  price: number;
  lesson_count: number;
  start_date: string;
  end_date: string;
  venues: { name: string; city: string | null } | null;
  courts: { name: string } | null;
}

export interface ClassFull extends ClassCard {
  description: string | null;
  status: string;
  venues: { name: string; city: string | null; address: string | null } | null;
}

export interface ClassSession { id: string; starts_at: string; ends_at: string }
export interface MyEnrollment { id: string; status: string; refunded: boolean; amount_paid: number; service_fee: number }

const CARD_FIELDS =
  'id, title, coach_name, level, capacity, enrolled_count, price, lesson_count, start_date, end_date, venues(name, city), courts(name)';

export const LEAVE_REFUND_HOURS = 48;

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "Agora" em Brasília no formato dos horários gravados (wall clock). */
export function wallNowText() {
  const d = new Date();
  // Hermes não garante toLocaleString com timeZone: calcula pelo offset fixo de Brasília (UTC−3, sem horário de verão desde 2019).
  const br = new Date(d.getTime() - 3 * 3600_000);
  return br.toISOString().substring(0, 19);
}
export const wallMs = (iso: string) => new Date(`${iso.substring(0, 19)}Z`).getTime();
export const wallNowMs = () => wallMs(wallNowText());

export const fmtShort = (d: string) => `${d.substring(8, 10)}/${d.substring(5, 7)}`;

export async function fetchOpenClasses(): Promise<ClassCard[]> {
  const { data, error } = await supabase.from('classes').select(CARD_FIELDS)
    .eq('status', 'active').gte('end_date', todayStr()).order('start_date');
  if (error) throw error;
  return (data as unknown as ClassCard[]) ?? [];
}

export async function fetchCourtClasses(courtId: string): Promise<ClassCard[]> {
  const { data, error } = await supabase.from('classes').select(CARD_FIELDS)
    .eq('court_id', courtId).eq('status', 'active').gte('end_date', todayStr()).order('start_date');
  if (error) throw error;
  return (data as unknown as ClassCard[]) ?? [];
}

export async function fetchMyActiveClassIds(userId: string): Promise<Set<string>> {
  const { data } = await supabase.from('class_enrollments').select('class_id').eq('player_id', userId).eq('status', 'active');
  return new Set((data ?? []).map(e => e.class_id as string));
}

export async function fetchClassPage(id: string, userId: string) {
  const [{ data: c, error }, { data: s }, { data: e }] = await Promise.all([
    supabase.from('classes')
      .select('id, title, coach_name, description, level, capacity, enrolled_count, price, lesson_count, start_date, end_date, status, venues(name, city, address), courts(name)')
      .eq('id', id).maybeSingle(),
    supabase.from('class_sessions').select('id, starts_at, ends_at').eq('class_id', id).order('starts_at'),
    supabase.from('class_enrollments').select('id, status, refunded, amount_paid, service_fee')
      .eq('class_id', id).eq('player_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (error) throw error;
  return {
    cls: (c as unknown as ClassFull) ?? null,
    sessions: (s ?? []) as ClassSession[],
    enrollment: (e as MyEnrollment) ?? null,
  };
}

// ── Próxima aula de cada curso (Home) ───────────────────────────────────────

export interface UpcomingClass {
  classId: string; title: string; coach: string; venueName: string; courtName: string;
  startsAt: string; endsAt: string; lessonNumber: number; lessonCount: number;
}

export async function fetchUpcomingClasses(userId: string): Promise<UpcomingClass[]> {
  if (!CLASSES_ENABLED) return [];
  const { data: enr } = await supabase.from('class_enrollments')
    .select('class_id, classes(id, title, coach_name, status, venues(name), courts(name))')
    .eq('player_id', userId).eq('status', 'active');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const active = (enr ?? []).map((e: any) => e.classes).filter((c: any) => c?.status === 'active');
  if (!active.length) return [];
  const { data: sessions } = await supabase.from('class_sessions')
    .select('class_id, starts_at, ends_at')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .in('class_id', active.map((c: any) => c.id)).order('starts_at');
  const now = wallNowText();
  const out: UpcomingClass[] = [];
  for (const c of active) {
    const list = (sessions ?? []).filter(s => s.class_id === c.id);
    const idx = list.findIndex(s => s.ends_at.substring(0, 19) > now);
    if (idx === -1) continue;
    out.push({
      classId: c.id, title: c.title, coach: c.coach_name,
      venueName: c.venues?.name ?? '', courtName: c.courts?.name ?? '',
      startsAt: list[idx].starts_at, endsAt: list[idx].ends_at,
      lessonNumber: idx + 1, lessonCount: list.length,
    });
  }
  return out;
}

// ── Meus cursos (Minhas Reservas) ───────────────────────────────────────────

export interface MyClassRow {
  id: string; status: string; refunded: boolean; amount_paid: number; service_fee: number;
  classes: { id: string; title: string; lesson_count: number; start_date: string; end_date: string; status: string; venues: { name: string } | null } | null;
}

export async function fetchMyClasses(userId: string): Promise<MyClassRow[]> {
  if (!CLASSES_ENABLED) return [];
  const { data } = await supabase.from('class_enrollments')
    .select('id, status, refunded, amount_paid, service_fee, classes(id, title, lesson_count, start_date, end_date, status, venues(name))')
    .eq('player_id', userId).order('created_at', { ascending: false });
  return ((data as unknown as MyClassRow[]) ?? []).filter(r => r.classes);
}

// ── Pagamento e desistência ─────────────────────────────────────────────────

async function readFnError(error: unknown, fallback: string) {
  const ctx = (error as { context?: Response }).context;
  try {
    const body = ctx ? await ctx.json() : null;
    if (body?.error) return String(body.error);
  } catch { /* not JSON */ }
  return error instanceof Error ? error.message : fallback;
}

/**
 * Abre o Checkout do Stripe no navegador do sistema (como as reservas). Volta por
 * joggahub://aulas/pagamento (ou exp://…/--/aulas/pagamento no Expo Go), que
 * confirma a inscrição com o servidor.
 */
export async function startClassCheckout(classId: string): Promise<'opened-success' | 'cancelled'> {
  const successUrl = Linking.createURL('aulas/pagamento');
  const cancelUrl = Linking.createURL(`aulas/${classId}`);
  const { data, error } = await supabase.functions.invoke('create-class-checkout-session', {
    body: { classId, successUrl, cancelUrl },
  });
  if (error) throw new Error(await readFnError(error, 'Não foi possível iniciar o pagamento.'));
  if (!data?.url) throw new Error('Não foi possível abrir o pagamento.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, Linking.createURL(''));
  if (result.type !== 'success' || !result.url.includes('aulas/pagamento')) return 'cancelled';
  const { queryParams } = Linking.parse(result.url);
  const sessionId = typeof queryParams?.session_id === 'string' ? queryParams.session_id : '';
  router.push({ pathname: '/aulas/pagamento', params: { session_id: sessionId } });
  return 'opened-success';
}

export async function leaveClass(enrollmentId: string): Promise<{ refunded: boolean }> {
  const { data, error } = await supabase.functions.invoke('leave-class', { body: { enrollmentId } });
  if (error) throw new Error(await readFnError(error, 'Não foi possível cancelar sua inscrição.'));
  return { refunded: !!data?.refunded };
}
