// Chaves liga/desliga do site (jogador e gestor).

// Aulas (cursos do clube). Ligado só onde VITE_CLASSES_ENABLED=true
// (hoje: .env.development.local, que aponta para o staging). Em produção fica
// desligado até as tabelas/funções de aulas serem publicadas lá.
export const CLASSES_ENABLED = import.meta.env.VITE_CLASSES_ENABLED === 'true';
