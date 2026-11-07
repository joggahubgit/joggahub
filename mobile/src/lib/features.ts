// Chaves liga/desliga do app.

// Aulas (cursos do clube). Ligado só onde EXPO_PUBLIC_CLASSES_ENABLED=true
// (mobile/.env → staging). Em produção fica desligado até as aulas serem
// publicadas lá. Lido com acesso estático (EXPO_PUBLIC_* é embutido no build).
export const CLASSES_ENABLED = process.env.EXPO_PUBLIC_CLASSES_ENABLED === 'true';
