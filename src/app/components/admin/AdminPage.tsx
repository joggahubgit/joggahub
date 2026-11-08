// Administração do JoggaHub (backoffice): visão geral financeira, transações do
// Stripe, repasses, arenas e equipe. Login e sessão próprios; a permissão é
// conferida no servidor (is_platform_admin) em todas as chamadas.
import { useEffect, useState } from 'react';
import { Loader2, ShieldAlert, LogOut, Lock, LayoutDashboard, ReceiptText, Banknote, Building2, Users, Menu, X } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import OverviewTab from './OverviewTab';
import TransactionsTab from './TransactionsTab';
import PayoutsTab from './PayoutsTab';
import VenuesTab from './VenuesTab';
import TeamTab from './TeamTab';

// ── Login da administração ───────────────────────────────────────────────────
function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (err) setError('Email ou senha incorretos.');
    setBusy(false);
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="bg-gray-900 text-white text-center px-8 pt-8 pb-6">
          <img src="/logo.png" alt="JoggaHub" className="w-14 h-14 rounded-2xl object-contain mx-auto mb-3 brightness-0 invert" />
          <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Administração</p>
          <h1 className="text-xl font-bold">JoggaHub</h1>
        </div>
        <form onSubmit={submit} className="p-8 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="username"
              placeholder="admin@joggahub.com"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password"
              placeholder="••••••••"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={busy}
            className="w-full py-3 rounded-xl bg-gray-900 text-white font-bold hover:bg-black disabled:opacity-60 flex items-center justify-center gap-2">
            <Lock className="w-4 h-4" />{busy ? 'Entrando…' : 'Entrar'}
          </button>
          <p className="text-[11px] text-gray-400 text-center">Acesso exclusivo da equipe JoggaHub.</p>
        </form>
      </div>
    </div>
  );
}

// ── Página: login → confere permissão → painel ─────────────────────────────
export default function AdminPage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-500" /></div>;
  }
  if (!session) return <AdminLogin />;
  return <AdminShell email={session.user.email ?? ''} />;
}

type Tab = 'overview' | 'transactions' | 'payouts' | 'venues' | 'team';
const TABS: { id: Tab; label: string; icon: typeof Banknote }[] = [
  { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'transactions', label: 'Transações', icon: ReceiptText },
  { id: 'payouts', label: 'Repasses', icon: Banknote },
  { id: 'venues', label: 'Arenas', icon: Building2 },
  { id: 'team', label: 'Equipe', icon: Users },
];

function AdminShell({ email }: { email: string }) {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>(() => {
    const t = new URLSearchParams(window.location.search).get('tab') as Tab | null;
    return t && TABS.some(x => x.id === t) ? t : 'overview';
  });
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    supabase.rpc('is_platform_admin').then(({ data }) => setAllowed(data === true));
  }, [email]);

  function go(t: Tab) {
    setTab(t);
    setMenuOpen(false);
    window.history.replaceState(null, '', `/admin?tab=${t}`);
  }

  if (allowed === null) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  }
  if (!allowed) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <ShieldAlert className="w-12 h-12 text-gray-300" />
        <p className="font-semibold text-gray-700">Esta conta não tem acesso à administração.</p>
        <p className="text-sm text-gray-400">{email}</p>
        <button onClick={() => supabase.auth.signOut()} className="text-gray-900 font-semibold flex items-center gap-1.5"><LogOut className="w-4 h-4" />Sair e entrar com outra conta</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gray-900 text-white sticky top-0 z-30">
        <div className="flex items-center gap-3 px-4 sm:px-6 py-3">
          <button onClick={() => setMenuOpen(o => !o)} className="lg:hidden p-1" aria-label="Menu">{menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}</button>
          <img src="/logo.png" alt="" className="w-8 h-8 rounded-lg object-contain brightness-0 invert" />
          <div className="flex-1">
            <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold leading-none">Administração</p>
            <p className="font-bold leading-tight">JoggaHub</p>
          </div>
          <span className="hidden sm:block text-xs text-gray-400">{email}</span>
          <button onClick={() => supabase.auth.signOut()} className="flex items-center gap-1.5 text-sm text-gray-300 hover:text-white"><LogOut className="w-4 h-4" />Sair</button>
        </div>
      </header>
      <div className="flex">
        <aside className={`${menuOpen ? 'block' : 'hidden'} lg:block fixed lg:sticky top-[56px] z-20 w-56 h-[calc(100vh-56px)] bg-white border-r border-gray-200 p-3 space-y-1`}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => go(t.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm ${tab === t.id ? 'bg-gray-900 text-white font-semibold' : 'text-gray-700 hover:bg-gray-100'}`}>
              <t.icon className="w-4 h-4" />{t.label}
            </button>
          ))}
        </aside>
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
          <div className="max-w-6xl mx-auto">
            {tab === 'overview' && <OverviewTab />}
            {tab === 'transactions' && <TransactionsTab />}
            {tab === 'payouts' && <PayoutsTab />}
            {tab === 'venues' && <VenuesTab />}
            {tab === 'team' && <TeamTab />}
          </div>
        </main>
      </div>
    </div>
  );
}
