/** Maps Supabase Auth errors to Portuguese messages without leaking internals. */
export function authErrorMessage(err: unknown): string {
  const e = err as { message?: string; code?: string; status?: number } | null;
  const code = e?.code ?? '';
  const msg = (e?.message ?? '').toLowerCase();

  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) return 'Email ou senha incorretos.';
  if (code === 'email_not_confirmed' || msg.includes('email not confirmed'))
    return 'Confirme seu email antes de entrar. Verifique sua caixa de entrada.';
  if (code === 'user_already_exists' || msg.includes('already registered')) return 'Já existe uma conta com este email.';
  if (code === 'weak_password' || msg.includes('password should be')) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (code === 'over_request_rate_limit' || e?.status === 429) return 'Muitas tentativas. Aguarde um pouco e tente de novo.';
  if (msg.includes('network') || msg.includes('fetch')) return 'Sem conexão. Verifique sua internet e tente de novo.';
  return 'Não foi possível concluir. Tente novamente.';
}
