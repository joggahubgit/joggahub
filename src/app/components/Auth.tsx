import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Auth() {
  const navigate = useNavigate();
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isSignUp) {
        await signUp(formData.email, formData.password, formData.name);
        navigate('/onboarding');
      } else {
        await signIn(formData.email, formData.password);
        navigate('/home');
      }
    } catch (err: any) {
      setError(err.message || 'Ocorreu um erro. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-violet-600 text-white px-6 py-4">
        <button onClick={() => navigate('/')} className="flex items-center gap-2">
          <ArrowLeft className="w-5 h-5" />
          <span>Voltar</span>
        </button>
      </div>

      <div className="px-6 py-8">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-block bg-violet-100 rounded-full p-4 mb-4">
            <img src="/logo.png" alt="JoggaHub" className="w-10 h-10 object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Bem-vindo ao JoggaHub</h1>
          <p className="text-gray-600 mt-2">Entre ou crie sua conta</p>
        </div>

        {!showEmailForm ? (
          <div className="space-y-4">
            {/* Google Login */}
            <button
              onClick={async () => { try { await signInWithGoogle(); } catch (e: any) { setError(e.message); } }}
              className="w-full bg-white border-2 border-gray-200 py-4 rounded-xl font-semibold text-gray-700 flex items-center justify-center gap-3 hover:bg-gray-50 transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 20 20">
                <path fill="#4285F4" d="M19.6 10.2c0-.7-.1-1.4-.2-2H10v3.8h5.4c-.2 1.2-1 2.2-2 2.9v2.5h3.2c1.9-1.7 3-4.3 3-7.2z"/>
                <path fill="#34A853" d="M10 20c2.7 0 4.9-.9 6.6-2.4l-3.2-2.5c-.9.6-2 .9-3.4.9-2.6 0-4.8-1.8-5.6-4.1H1.1v2.6C2.8 17.8 6.1 20 10 20z"/>
                <path fill="#FBBC04" d="M4.4 12c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V5.4H1.1C.4 6.8 0 8.4 0 10s.4 3.2 1.1 4.6l3.3-2.6z"/>
                <path fill="#EA4335" d="M10 4c1.4 0 2.7.5 3.7 1.5l2.8-2.8C14.9 1.1 12.7 0 10 0 6.1 0 2.8 2.2 1.1 5.4l3.3 2.6C5.2 5.8 7.4 4 10 4z"/>
              </svg>
              Continuar com Google
            </button>

            {/* Apple Login */}
            <button
              className="w-full bg-black text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-3 hover:bg-gray-900 transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="white">
                <path d="M15.5 10.3c0-2.4 2-3.6 2.1-3.6-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.1-2.8.9-3.6.9-.7 0-1.9-.9-3.1-.9-1.6 0-3.1 1-3.9 2.4-1.7 2.9-.4 7.2 1.2 9.6.8 1.2 1.7 2.5 3 2.4 1.2 0 1.6-.8 3.1-.8s1.8.8 3.1.8c1.3 0 2.1-1.1 2.9-2.3.9-1.4 1.3-2.7 1.3-2.8-.1 0-2.4-1-2.6-3.8zM13 3.7c.7-.8 1.1-2 1-3.1-.9 0-2.1.6-2.7 1.4-.6.7-1.1 1.9-1 3 1 .1 2-.5 2.7-1.3z"/>
              </svg>
              Continuar com Apple
            </button>

            {/* Email Login */}
            <button
              onClick={() => setShowEmailForm(true)}
              className="w-full bg-violet-600 text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-3 hover:bg-violet-700 transition-colors"
            >
              <Mail className="w-5 h-5" />
              Continuar com Email
            </button>

            <div className="text-center text-sm text-gray-500 mt-6">
              Ao continuar, você concorda com nossos <br />
              <a href="/terms" className="text-violet-600 underline">Termos de Uso</a> e{' '}
              <a href="/privacy" className="text-violet-600 underline">Política de Privacidade</a>
            </div>
          </div>
        ) : (
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            {/* Toggle sign in / sign up */}
            <div className="flex bg-gray-100 rounded-xl p-1 mb-4">
              <button
                type="button"
                onClick={() => setIsSignUp(false)}
                className={`flex-1 py-2 rounded-lg font-semibold transition-all ${!isSignUp ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
              >
                Entrar
              </button>
              <button
                type="button"
                onClick={() => setIsSignUp(true)}
                className={`flex-1 py-2 rounded-lg font-semibold transition-all ${isSignUp ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
              >
                Cadastrar
              </button>
            </div>

            {isSignUp && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Nome completo</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-violet-600 focus:outline-none"
                  placeholder="João Silva"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-violet-600 focus:outline-none"
                placeholder="seu@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Senha</label>
              <input
                type="password"
                required
                minLength={6}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-violet-600 focus:outline-none"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-violet-600 text-white py-4 rounded-xl font-semibold hover:bg-violet-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-5 h-5 animate-spin" />}
              {isSignUp ? 'Criar conta' : 'Entrar'}
            </button>

            <button
              type="button"
              onClick={() => setShowEmailForm(false)}
              className="w-full text-gray-600 py-2"
            >
              Voltar para outras opções
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
