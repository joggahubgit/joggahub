import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Loader2, Check } from 'lucide-react';
import { useAuth } from '@/app/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isPasswordAccount = user?.app_metadata?.provider === 'email';

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword.length < 6) {
      setError('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSuccess(true);
    setNewPassword('');
    setConfirmPassword('');
    setTimeout(() => {
      setShowPasswordForm(false);
      setSuccess(false);
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-6">
      <div className="bg-white border-b border-gray-200">
        <div className="px-6 py-4">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="text-gray-600 hover:text-gray-900"><ArrowLeft className="w-6 h-6" /></button>
            <h1 className="text-xl font-bold text-gray-900">Configurações</h1>
          </div>
        </div>
      </div>

      <div className="px-6 py-6 space-y-6">
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {isPasswordAccount && (
            <div className="border-b border-gray-100">
              <button
                onClick={() => setShowPasswordForm(v => !v)}
                className="w-full p-4 flex items-center justify-between hover:bg-gray-50"
              >
                <h3 className="font-semibold text-gray-900">Alterar senha</h3>
                <ChevronRight className={`w-5 h-5 text-gray-400 transition-transform ${showPasswordForm ? 'rotate-90' : ''}`} />
              </button>
              {showPasswordForm && (
                <form onSubmit={handleChangePassword} className="px-4 pb-4 space-y-3">
                  <input
                    type="password"
                    placeholder="Nova senha"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                  <input
                    type="password"
                    placeholder="Confirmar nova senha"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                  {error && <p className="text-sm text-red-600">{error}</p>}
                  {success && <p className="text-sm text-green-600 flex items-center gap-1"><Check className="w-4 h-4" /> Senha atualizada</p>}
                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full bg-violet-600 text-white font-semibold py-2.5 rounded-xl hover:bg-violet-700 disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    Salvar nova senha
                  </button>
                </form>
              )}
            </div>
          )}
          <a
            href="mailto:info@joggahub.com?subject=Solicita%C3%A7%C3%A3o%20de%20exclus%C3%A3o%20de%20conta"
            className="w-full p-4 flex items-center justify-between hover:bg-gray-50"
          >
            <h3 className="font-semibold text-red-600">Excluir conta</h3>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </a>
        </div>
      </div>
    </div>
  );
}
