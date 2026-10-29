// Opened from the password-recovery email (web or app request). Supabase puts a
// recovery session in the URL; this page lets the user choose a new password.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, KeyRound, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Status = 'checking' | 'ready' | 'invalid' | 'done';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Expired/used links come back with an error in the URL instead of a session.
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    if (hash.get('error') || query.get('error')) {
      setStatus('invalid');
      return;
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        setStatus(s => (s === 'checking' ? 'ready' : s));
      }
    });
    // The client reads the link on load; if no session shows up, the link is invalid.
    const timer = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      setStatus(s => (s === 'checking' ? (data.session ? 'ready' : 'invalid') : s));
    }, 2500);
    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 6) return setError('A senha precisa ter pelo menos 6 caracteres.');
    if (password !== confirm) return setError('As senhas não coincidem.');
    setSaving(true);
    const { error: updErr } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updErr) {
      setError(
        updErr.message.toLowerCase().includes('different from the old')
          ? 'A nova senha precisa ser diferente da anterior.'
          : 'Não foi possível salvar a nova senha. Peça um novo link e tente de novo.',
      );
      return;
    }
    setStatus('done');
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        {status === 'checking' && (
          <div className="flex justify-center">
            <div className="w-8 h-8 border-4 border-violet-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {status === 'invalid' && (
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Link inválido ou expirado</h1>
            <p className="text-gray-500 mb-8">Peça um novo link em “Esqueci minha senha”.</p>
            <button
              onClick={() => navigate('/auth', { replace: true })}
              className="w-full bg-violet-600 text-white py-4 rounded-xl font-semibold hover:bg-violet-700 transition-colors"
            >
              Ir para o login
            </button>
          </div>
        )}

        {status === 'done' && (
          <div className="text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6 mx-auto">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Senha alterada!</h1>
            <p className="text-gray-500 mb-8">Use a nova senha para entrar no site ou no app.</p>
            <button
              onClick={() => navigate('/home', { replace: true })}
              className="w-full bg-violet-600 text-white py-4 rounded-xl font-semibold hover:bg-violet-700 transition-colors"
            >
              Continuar
            </button>
          </div>
        )}

        {status === 'ready' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="text-center mb-6">
              <div className="inline-block bg-violet-100 rounded-full p-4 mb-4">
                <KeyRound className="w-8 h-8 text-violet-600" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Criar nova senha</h1>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Nova senha</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-violet-600 focus:outline-none"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Confirmar nova senha</label>
              <input
                type="password"
                required
                minLength={6}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-violet-600 focus:outline-none"
                placeholder="••••••••"
              />
            </div>
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
            )}
            <button
              type="submit"
              disabled={saving}
              className="w-full bg-violet-600 text-white py-4 rounded-xl font-semibold hover:bg-violet-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-5 h-5 animate-spin" />}
              Salvar nova senha
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
