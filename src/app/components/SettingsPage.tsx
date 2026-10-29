import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Loader2, Check, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/app/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
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

  // Account deletion: the server refuses while games, bookings or plans are still
  // active and tells the user what to close first.
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<{ message: string; blockers: string[] } | null>(null);

  const handleDeleteAccount = async () => {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    const { data, error: fnErr } = await supabase.functions.invoke('delete-account', { body: { confirm: true } });
    if (fnErr || !data?.deleted) {
      const body = await (fnErr as any)?.context?.json?.().catch(() => null);
      setDeleteError({ message: body?.error ?? data?.error ?? 'Não foi possível excluir a conta. Tente novamente.', blockers: body?.blockers ?? [] });
      setDeleting(false);
      return;
    }
    await signOut().catch(() => {});
    navigate('/', { replace: true });
  };

  const closeDelete = () => {
    if (deleting) return;
    setShowDelete(false);
    setDeleteError(null);
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
          <button
            onClick={() => setShowDelete(true)}
            className="w-full p-4 flex items-center justify-between hover:bg-gray-50"
          >
            <h3 className="font-semibold text-red-600">Excluir conta</h3>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      </div>
      {showDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50" onClick={closeDelete}>
          <div className="bg-white rounded-t-3xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-5" />
            <div className="flex flex-col items-center text-center mb-4">
              <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mb-3">
                <AlertTriangle className="w-7 h-7 text-red-600" />
              </div>
              <h3 className="font-bold text-gray-900 text-xl">Excluir conta?</h3>
            </div>
            {deleteError ? (
              <div className="bg-red-50 border border-red-100 rounded-2xl p-4 mb-5 space-y-2">
                <p className="text-sm font-semibold text-red-600">{deleteError.message}</p>
                {deleteError.blockers.map(b => <p key={b} className="text-sm text-red-600">• {b}</p>)}
              </div>
            ) : (
              <div className="space-y-2 mb-5">
                <p className="text-sm text-gray-600 leading-relaxed">
                  Seus dados pessoais (nome, telefone, foto e perfil) serão apagados e você não poderá mais entrar com esta conta.
                </p>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Partidas já jogadas continuam no histórico dos outros jogadores como “Usuário removido”. Esta ação não pode ser desfeita.
                </p>
              </div>
            )}
            <div className="space-y-3">
              {!deleteError?.blockers.length && (
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                  className="w-full bg-red-600 text-white py-4 rounded-2xl font-bold hover:bg-red-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {deleting ? <><Loader2 className="w-5 h-5 animate-spin" /> Excluindo...</> : 'Excluir minha conta'}
                </button>
              )}
              <button onClick={closeDelete} disabled={deleting} className="w-full py-3 text-sm text-gray-500 font-semibold">
                {deleteError?.blockers.length ? 'Entendi' : 'Cancelar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
