import { supabase } from '@/lib/supabase-gestor';
import { CLASSES_ENABLED } from '@/app/lib/features';

/**
 * Dos slots informados, quais estão bloqueados por aula de um curso ativo.
 * Usado para não apagar/mexer nesses horários (o banco também protege:
 * trg_guard_class_slots). Com as aulas desligadas, retorna vazio.
 */
export async function classSlotIds(slotIds: string[]): Promise<Set<string>> {
  if (!CLASSES_ENABLED || !slotIds.length) return new Set();
  const out = new Set<string>();
  for (let i = 0; i < slotIds.length; i += 80) {
    const { data } = await supabase
      .from('class_session_slots')
      .select('slot_id, class_sessions(classes(status))')
      .in('slot_id', slotIds.slice(i, i + 80));
    (data ?? []).forEach((r: any) => {
      if (r.class_sessions?.classes?.status === 'active') out.add(r.slot_id);
    });
  }
  return out;
}
