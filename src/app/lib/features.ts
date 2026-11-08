// Chaves liga/desliga do site (jogador e gestor).

// Aulas (cursos do clube). LIGADO desde 08/11/2026 (banco e funções publicados
// em produção). Para desligar em emergência: VITE_CLASSES_ENABLED=false no
// Vercel + Redeploy, ou trocar esta linha para `false` e publicar.
export const CLASSES_ENABLED = import.meta.env.VITE_CLASSES_ENABLED !== 'false';
