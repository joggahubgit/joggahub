// Equipe: administradores do JoggaHub (adicionar por email, remover).
import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, ShieldCheck } from 'lucide-react';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

interface Admin { user_id: string; email: string; since: string; last_sign_in: string | null; me: boolean }

export default function TeamTab() {
  const [admins, setAdmins] = useState<Admin[] | null>(null);
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_list_admins');
    if (error) setErr(error.message);
    setAdmins((data as Admin[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add() {
    setErr('');
    const { error } = await supabase.rpc('admin_add_admin', { p_email: email });
    if (error) { setErr(error.message); return; }
    setEmail(''); load();
  }
  async function remove(a: Admin) {
    if (!window.confirm(`Remover ${a.email} da administração?`)) return;
    setErr('');
    const { error } = await supabase.rpc('admin_remove_admin', { p_user: a.user_id });
    if (error) setErr(error.message); else load();
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="text-2xl font-bold text-gray-900">Equipe</h2>
      <p className="text-sm text-gray-500">Pessoas com acesso a esta administração (financeiro, repasses e arenas).</p>
      <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
        {admins === null ? <p className="flex items-center justify-center gap-2 text-gray-400 py-10"><Loader2 className="w-5 h-5 animate-spin" /></p>
          : admins.map(a => (
            <div key={a.user_id} className="flex items-center gap-3 px-5 py-3">
              <ShieldCheck className="w-5 h-5 text-gray-400" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{a.email}{a.me ? ' (você)' : ''}</p>
                <p className="text-[11px] text-gray-400">Desde {new Date(a.since).toLocaleDateString('pt-BR')} · último acesso {a.last_sign_in ? new Date(a.last_sign_in).toLocaleDateString('pt-BR') : 'nunca'}</p>
              </div>
              {!a.me && <button onClick={() => remove(a)} className="text-xs font-semibold text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg">Remover</button>}
            </div>
          ))}
      </div>
      <div className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-wrap gap-2 items-center">
        <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="email@joggahub.com"
          className="flex-1 min-w-[200px] border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        <button onClick={add} disabled={!email} className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold flex items-center gap-1.5 disabled:opacity-40">
          <Plus className="w-4 h-4" />Adicionar administrador
        </button>
        <p className="w-full text-[11px] text-gray-400">A pessoa precisa já ter uma conta no JoggaHub com esse email.</p>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
    </div>
  );
}
