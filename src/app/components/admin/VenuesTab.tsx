// Arenas: lista, cadastro de arena nova (gestor + clube + quadras), edição de
// dados, dados bancários (PIX) e regra de repasse, quadras ativas/inativas.
import { useCallback, useEffect, useState } from 'react';
import { Building2, ChevronDown, ChevronUp, Loader2, Plus, Trash2, X, Copy, CheckCircle } from 'lucide-react';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { brl } from './shared';

interface Court { id: string; name: string; sport_type: string; price_per_hour: number; is_active: boolean }
interface Venue {
  id: string; name: string; city: string | null; address: string | null; phone: string | null; email: string | null;
  created_at: string; admin_email: string | null; admin_last_sign_in: string | null;
  courts: Court[];
  payout: { schedule: 'per_game' | 'weekly'; pix_key: string | null; account_holder: string | null; document: string | null };
  month_club_paid: number; month_items: number;
}

const SPORTS: [string, string][] = [['futevolei', 'Futevôlei'], ['society', 'Society'], ['futsal', 'Futsal']];
const sportLabel = (s: string) => SPORTS.find(x => x[0] === s)?.[1] ?? s;
const input = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/20';
const label = 'block text-xs font-semibold text-gray-500 mb-1';

export default function VenuesTab() {
  const [venues, setVenues] = useState<Venue[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('admin_venues');
    if (e) setError(e.message);
    setVenues((data as Venue[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-gray-900">Arenas</h2>
        <button onClick={() => setCreating(true)} className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-black">
          <Plus className="w-4 h-4" />Cadastrar arena
        </button>
      </div>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3">{error}</div>}
      {venues === null ? (
        <p className="flex items-center justify-center gap-2 text-gray-400 py-16"><Loader2 className="w-5 h-5 animate-spin" />Carregando…</p>
      ) : venues.map(v => (
        <VenueRow key={v.id} v={v} expanded={open === v.id} onToggle={() => setOpen(o => (o === v.id ? null : v.id))} onChanged={load} />
      ))}
      {creating && <CreateVenueModal onClose={() => setCreating(false)} onCreated={() => { load(); }} />}
    </div>
  );
}

function VenueRow({ v, expanded, onToggle, onChanged }: { v: Venue; expanded: boolean; onToggle: () => void; onChanged: () => void }) {
  const [form, setForm] = useState({
    name: v.name, city: v.city ?? '', address: v.address ?? '', phone: v.phone ?? '', email: v.email ?? '',
    schedule: v.payout.schedule, pix_key: v.payout.pix_key ?? '', account_holder: v.payout.account_holder ?? '', document: v.payout.document ?? '',
  });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [newCourt, setNewCourt] = useState({ name: '', sport: 'futevolei', price: '' });
  const set = (k: keyof typeof form, val: string) => setForm(f => ({ ...f, [k]: val }));
  const active = v.courts.filter(c => c.is_active).length;
  const missingPix = !v.payout.pix_key;

  async function save() {
    setErr(''); setMsg('');
    const { error } = await supabase.rpc('admin_update_venue', { p_venue: v.id, p_data: form });
    if (error) { setErr(error.message); return; }
    setMsg('Dados salvos.'); onChanged();
  }
  async function toggleCourt(c: Court) {
    const { error } = await supabase.rpc('admin_set_court_active', { p_court: c.id, p_active: !c.is_active });
    if (error) setErr(error.message); else onChanged();
  }
  async function addCourt() {
    setErr('');
    const { error } = await supabase.rpc('admin_add_court', { p_venue: v.id, p_name: newCourt.name, p_sport: newCourt.sport, p_price: Number(newCourt.price.replace(',', '.')) || 0 });
    if (error) { setErr(error.message); return; }
    setNewCourt({ name: '', sport: 'futevolei', price: '' }); onChanged();
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200">
      <button onClick={onToggle} className="w-full text-left p-5 flex flex-wrap items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center"><Building2 className="w-5 h-5 text-gray-500" /></div>
        <div className="flex-1 min-w-[200px]">
          <p className="font-bold text-gray-900">{v.name}</p>
          <p className="text-xs text-gray-500">{v.city ?? 'Sem cidade'} · {active} {active === 1 ? 'quadra ativa' : 'quadras ativas'} · gestor {v.admin_email ?? '—'}</p>
        </div>
        {missingPix && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Sem chave PIX</span>}
        <div className="text-right">
          <p className="text-[11px] text-gray-400 uppercase tracking-wide">Clube no mês</p>
          <p className="font-semibold tabular-nums">{brl(Number(v.month_club_paid))}</p>
        </div>
        {expanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
      </button>

      {expanded && (
        <div className="border-t border-gray-100 p-5 grid lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Dados da arena</p>
            <div><label className={label}>Nome</label><input className={input} value={form.name} onChange={e => set('name', e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className={label}>Cidade</label><input className={input} value={form.city} onChange={e => set('city', e.target.value)} placeholder="São Paulo" /></div>
              <div><label className={label}>Telefone</label><input className={input} value={form.phone} onChange={e => set('phone', e.target.value)} /></div>
            </div>
            <div><label className={label}>Endereço</label><input className={input} value={form.address} onChange={e => set('address', e.target.value)} /></div>
            <div><label className={label}>Email de contato</label><input className={input} value={form.email} onChange={e => set('email', e.target.value)} /></div>
            <p className="text-[11px] text-gray-400">
              Gestor: {v.admin_email ?? '—'} · último acesso {v.admin_last_sign_in ? new Date(v.admin_last_sign_in).toLocaleDateString('pt-BR') : 'nunca'} · cadastrada em {new Date(v.created_at).toLocaleDateString('pt-BR')}
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Repasse</p>
            <div>
              <label className={label}>Regra</label>
              <select className={input} value={form.schedule} onChange={e => set('schedule', e.target.value)}>
                <option value="per_game">Por partida (logo depois que acontece)</option>
                <option value="weekly">Semanal (segunda, jogos da semana anterior)</option>
              </select>
            </div>
            <div><label className={label}>Chave PIX</label><input className={input} value={form.pix_key} onChange={e => set('pix_key', e.target.value)} placeholder="CNPJ, email, telefone ou chave aleatória" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className={label}>Titular da conta</label><input className={input} value={form.account_holder} onChange={e => set('account_holder', e.target.value)} /></div>
              <div><label className={label}>CPF/CNPJ do titular</label><input className={input} value={form.document} onChange={e => set('document', e.target.value)} /></div>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button onClick={save} className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold">Salvar dados</button>
              {msg && <span className="text-sm text-green-700 flex items-center gap-1"><CheckCircle className="w-4 h-4" />{msg}</span>}
            </div>
          </div>

          <div className="lg:col-span-2 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Quadras</p>
            <div className="border border-gray-100 rounded-xl divide-y divide-gray-100">
              {v.courts.map(c => (
                <div key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className={`flex-1 ${c.is_active ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{c.name}</span>
                  <span className="text-gray-500 w-24">{sportLabel(c.sport_type)}</span>
                  <span className="text-gray-500 w-24 tabular-nums">{brl(Number(c.price_per_hour))}/h</span>
                  <button onClick={() => toggleCourt(c)} className={`text-xs font-semibold px-2 py-1 rounded-lg ${c.is_active ? 'text-red-600 hover:bg-red-50' : 'text-green-700 hover:bg-green-50'}`}>
                    {c.is_active ? 'Desativar' : 'Reativar'}
                  </button>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                <input className={`${input} flex-1 min-w-[140px]`} placeholder="Nova quadra (ex.: Quadra 2)" value={newCourt.name} onChange={e => setNewCourt(n => ({ ...n, name: e.target.value }))} />
                <select className={`${input} w-32`} value={newCourt.sport} onChange={e => setNewCourt(n => ({ ...n, sport: e.target.value }))}>
                  {SPORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <input className={`${input} w-28`} placeholder="R$/hora" inputMode="decimal" value={newCourt.price} onChange={e => setNewCourt(n => ({ ...n, price: e.target.value }))} />
                <button onClick={addCourt} className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold flex items-center gap-1"><Plus className="w-4 h-4" />Adicionar</button>
              </div>
            </div>
            <p className="text-[11px] text-gray-400">Quadra desativada some para os jogadores; reservas já feitas continuam valendo.</p>
          </div>
          {err && <p className="lg:col-span-2 text-sm text-red-600">{err}</p>}
        </div>
      )}
    </div>
  );
}

// ── Cadastrar arena nova ────────────────────────────────────────────────────
function CreateVenueModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [f, setF] = useState({
    name: '', city: '', address: '', phone: '', gestorName: '', gestorEmail: '',
    schedule: 'per_game', pixKey: '', accountHolder: '', document: '',
  });
  const [courts, setCourts] = useState([{ name: 'Quadra 1', sport_type: 'futevolei', price_per_hour: '' }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<{ gestorEmail: string; tempPassword: string | null; existingAccount: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF(x => ({ ...x, [k]: v }));

  async function submit() {
    setBusy(true); setErr('');
    const { data, error } = await supabase.functions.invoke('admin-create-venue', {
      body: { ...f, courts: courts.map(c => ({ ...c, price_per_hour: Number(String(c.price_per_hour).replace(',', '.')) || 0 })) },
    });
    setBusy(false);
    if (error) {
      const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
      setErr(body?.error ?? error.message); return;
    }
    setDone(data as { gestorEmail: string; tempPassword: string | null; existingAccount: boolean });
    onCreated();
  }

  const loginUrl = `${window.location.origin}/gestor`;
  const msgText = done ? `Olá! Sua arena já está no JoggaHub.\n\nAcesse o painel do gestor: ${loginUrl}\nEmail: ${done.gestorEmail}${done.tempPassword ? `\nSenha inicial: ${done.tempPassword}\n\nRecomendamos trocar a senha no primeiro acesso.` : '\nUse a senha que você já tem.'}` : '';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-bold">Cadastrar arena</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
        </div>

        {done ? (
          <div className="p-6 space-y-4">
            <p className="flex items-center gap-2 text-green-700 font-semibold"><CheckCircle className="w-5 h-5" />Arena cadastrada!</p>
            <p className="text-sm text-gray-600">Envie estes dados de acesso ao gestor (WhatsApp ou email). {done.tempPassword ? 'A senha inicial só aparece agora.' : 'O gestor já tinha conta e vai usar a senha dele.'}</p>
            <pre className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm whitespace-pre-wrap font-sans">{msgText}</pre>
            <div className="flex gap-2">
              <button onClick={() => { navigator.clipboard.writeText(msgText); setCopied(true); }} className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold flex items-center gap-1.5">
                <Copy className="w-4 h-4" />{copied ? 'Copiado!' : 'Copiar mensagem'}
              </button>
              <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold">Fechar</button>
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-y-auto flex-1 p-6 space-y-5">
              <section className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Arena</p>
                <div><label className={label}>Nome da arena</label><input className={input} value={f.name} onChange={e => set('name', e.target.value)} placeholder="Ex.: Arena Beach Pinheiros" /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={label}>Cidade</label><input className={input} value={f.city} onChange={e => set('city', e.target.value)} placeholder="São Paulo" /></div>
                  <div><label className={label}>Telefone</label><input className={input} value={f.phone} onChange={e => set('phone', e.target.value)} /></div>
                </div>
                <div><label className={label}>Endereço</label><input className={input} value={f.address} onChange={e => set('address', e.target.value)} /></div>
              </section>

              <section className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Gestor (acesso ao painel)</p>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={label}>Nome</label><input className={input} value={f.gestorName} onChange={e => set('gestorName', e.target.value)} /></div>
                  <div><label className={label}>Email</label><input className={input} type="email" value={f.gestorEmail} onChange={e => set('gestorEmail', e.target.value)} /></div>
                </div>
                <p className="text-[11px] text-gray-400">Se o email ainda não tem conta, criamos uma com senha inicial. Se já tem, ele usa a senha que já tem.</p>
              </section>

              <section className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Quadras</p>
                {courts.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input className={`${input} flex-1`} value={c.name} onChange={e => setCourts(cs => cs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Nome da quadra" />
                    <select className={`${input} w-32`} value={c.sport_type} onChange={e => setCourts(cs => cs.map((x, j) => (j === i ? { ...x, sport_type: e.target.value } : x)))}>
                      {SPORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                    <input className={`${input} w-28`} inputMode="decimal" value={c.price_per_hour} onChange={e => setCourts(cs => cs.map((x, j) => (j === i ? { ...x, price_per_hour: e.target.value } : x)))} placeholder="R$/hora" />
                    {courts.length > 1 && <button onClick={() => setCourts(cs => cs.filter((_, j) => j !== i))} className="p-2 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>}
                  </div>
                ))}
                <button onClick={() => setCourts(cs => [...cs, { name: `Quadra ${cs.length + 1}`, sport_type: cs[cs.length - 1]?.sport_type ?? 'futevolei', price_per_hour: cs[cs.length - 1]?.price_per_hour ?? '' }])}
                  className="text-sm font-semibold text-gray-700 flex items-center gap-1"><Plus className="w-4 h-4" />Adicionar quadra</button>
              </section>

              <section className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Repasse</p>
                <select className={input} value={f.schedule} onChange={e => set('schedule', e.target.value)}>
                  <option value="per_game">Por partida (logo depois que acontece)</option>
                  <option value="weekly">Semanal (segunda, jogos da semana anterior)</option>
                </select>
                <input className={input} value={f.pixKey} onChange={e => set('pixKey', e.target.value)} placeholder="Chave PIX (pode preencher depois)" />
                <div className="grid grid-cols-2 gap-2">
                  <input className={input} value={f.accountHolder} onChange={e => set('accountHolder', e.target.value)} placeholder="Titular da conta" />
                  <input className={input} value={f.document} onChange={e => set('document', e.target.value)} placeholder="CPF/CNPJ do titular" />
                </div>
              </section>
              {err && <p className="text-sm text-red-600">{err}</p>}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold">Cancelar</button>
              <button onClick={submit} disabled={busy} className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold disabled:opacity-60">
                {busy ? 'Cadastrando…' : 'Cadastrar arena'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
