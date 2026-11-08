import { useCallback, useEffect, useState } from 'react';
import { GraduationCap, Plus, Users, CalendarDays, MapPin, X, AlertTriangle, CheckCircle, Share2, Copy } from 'lucide-react';
import { supabase } from '@/lib/supabase-gestor';
import { classLevelLabel, formatBRL, formatSessionDate } from '@/app/lib/classSchedule';
import { CreateClassModal } from './CreateClassModal';
import { localDateStr } from './ScheduleGrid';

interface ClassRow {
  id: string;
  kind?: 'course' | 'day_use';
  title: string;
  coach_name: string;
  description: string | null;
  level: string;
  court_id: string;
  capacity: number;
  enrolled_count: number;
  price: number;
  lesson_count: number;
  start_date: string;
  end_date: string;
  status: 'active' | 'cancelled';
  courts: { name: string } | null;
}

interface Props {
  venueId: string;
  /** Abre direto o detalhe de um curso (ex.: clique numa aula na Agenda). */
  openClassId?: string | null;
  onOpenedClass?: () => void;
}

type Filter = 'upcoming' | 'finished' | 'cancelled';

const fmtDate = (d: string) => `${d.substring(8, 10)}/${d.substring(5, 7)}`;

export function ClassesPanel({ venueId, openClassId, onOpenedClass }: Props) {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('upcoming');
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [flash, setFlash] = useState('');
  const today = localDateStr(new Date());

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('classes')
      .select('id, title, coach_name, description, level, court_id, capacity, enrolled_count, price, lesson_count, start_date, end_date, status, courts(name)')
      .eq('venue_id', venueId)
      .eq('kind', 'course') // day use fica na Agenda (partida aberta do clube)
      .order('start_date', { ascending: true });
    if (error) console.error('[Classes] load', error);
    setClasses((data as unknown as ClassRow[]) ?? []);
    setLoading(false);
  }, [venueId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (openClassId) { setSelected(openClassId); onOpenedClass?.(); }
  }, [openClassId, onOpenedClass]);

  const visible = classes.filter(c =>
    filter === 'cancelled' ? c.status === 'cancelled'
      : filter === 'finished' ? c.status === 'active' && c.end_date < today
        : c.status === 'active' && c.end_date >= today);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Aulas</h2>
          <p className="text-sm text-gray-500">Cursos do clube. Os alunos se inscrevem e pagam pelo app.</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-purple-700 shadow-sm">
          <Plus className="w-4 h-4" /> Novo curso
        </button>
      </div>

      {flash && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-800 text-sm rounded-xl px-4 py-3">
          <CheckCircle className="w-4 h-4" /> {flash}
        </div>
      )}

      <div className="flex gap-2">
        {([['upcoming', 'Em andamento e próximos'], ['finished', 'Encerrados'], ['cancelled', 'Cancelados']] as const).map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold ${filter === v ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {l}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm py-8 text-center">Carregando...</p>
      ) : visible.length === 0 ? (
        <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 py-12 text-center">
          <GraduationCap className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">
            {filter === 'upcoming' ? 'Nenhum curso ativo. Crie o primeiro em "Novo curso".' : 'Nada por aqui.'}
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {visible.map(c => {
            const full = c.enrolled_count >= c.capacity;
            return (
              <button key={c.id} onClick={() => setSelected(c.id)}
                className="text-left bg-white rounded-2xl border border-gray-200 p-4 hover:shadow-md hover:border-purple-200 transition-all">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 truncate">{c.title}</p>
                    <p className="text-xs text-gray-500">{c.coach_name} · {classLevelLabel(c.level)}</p>
                  </div>
                  {c.status === 'cancelled'
                    ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600">Cancelado</span>
                    : <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${full ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'}`}>
                        {full ? 'Lotado' : `${c.capacity - c.enrolled_count} vagas`}
                      </span>}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-y-1.5 text-xs text-gray-600">
                  <span className="flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5 text-gray-400" />{fmtDate(c.start_date)} a {fmtDate(c.end_date)}</span>
                  <span className="flex items-center gap-1.5"><GraduationCap className="w-3.5 h-3.5 text-gray-400" />{c.lesson_count} aulas</span>
                  <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-gray-400" />{c.courts?.name ?? 'Quadra'}</span>
                  <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-gray-400" />{c.enrolled_count}/{c.capacity} alunos</span>
                </div>
                <p className="mt-3 text-sm font-bold text-purple-700">{formatBRL(Number(c.price))} <span className="text-xs font-normal text-gray-400">por aluno</span></p>
              </button>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateClassModal
          venueId={venueId}
          onClose={() => setShowCreate(false)}
          onCreated={id => { setShowCreate(false); setFlash('Curso criado e horários bloqueados na agenda.'); load(); setSelected(id); }}
        />
      )}

      {selected && (
        <ClassDetailModal
          classId={selected}
          onClose={() => setSelected(null)}
          onCancelled={msg => { setSelected(null); setFlash(msg); load(); }}
        />
      )}
    </div>
  );
}

// ── Detalhe do curso ─────────────────────────────────────────────────────────

interface Session { id: string; starts_at: string; ends_at: string }
interface Enrollment { id: string; player_id: string; amount_paid: number; status: string; refunded: boolean; created_at: string; payment_held?: boolean; name?: string }

export function ClassDetailModal({ classId, onClose, onCancelled }: { classId: string; onClose: () => void; onCancelled: (msg: string) => void }) {
  const [cls, setCls] = useState<ClassRow | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [copied, setCopied] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const [{ data: c }, { data: s }, { data: e }] = await Promise.all([
        supabase.from('classes')
          .select('id, kind, title, coach_name, description, level, court_id, capacity, enrolled_count, price, lesson_count, start_date, end_date, status, sport_type, courts(name), venues(name)')
          .eq('id', classId).maybeSingle(),
        supabase.from('class_sessions').select('id, starts_at, ends_at').eq('class_id', classId).order('starts_at'),
        supabase.from('class_enrollments').select('id, player_id, amount_paid, status, refunded, created_at, payment_held').eq('class_id', classId).order('created_at'),
      ]);
      setCls(c as unknown as ClassRow);
      setSessions(s ?? []);
      const rows = (e ?? []) as Enrollment[];
      const ids = [...new Set(rows.map(r => r.player_id))];
      if (ids.length) {
        const { data: profiles } = await supabase.from('profiles').select('id, name').in('id', ids);
        const names = Object.fromEntries((profiles ?? []).map(p => [p.id, p.name]));
        rows.forEach(r => { r.name = names[r.player_id] ?? 'Jogador'; });
      }
      setEnrollments(rows);
    })();
  }, [classId]);

  async function cancelClass() {
    setCancelling(true);
    setError('');
    const { data, error: fnErr } = await supabase.functions.invoke('cancel-class', { body: { classId } });
    setCancelling(false);
    if (fnErr) {
      const body = await (fnErr as any).context?.json?.().catch(() => null);
      setError(body?.error ?? fnErr.message ?? 'Não foi possível cancelar.');
      return;
    }
    const refunded = (data as any)?.refunded ?? 0;
    const failed = (data as any)?.failed ?? 0;
    onCancelled(
      failed
        ? `Cancelado. ${failed} reembolso(s) falharam. Entre em contato com o suporte.`
        : `${cls?.kind === 'day_use' ? 'Day use' : 'Curso'} cancelado e agenda liberada.${refunded ? ` ${refunded} aluno(s) reembolsado(s).` : ''}`,
    );
  }

  const active = enrollments.filter(e => e.status === 'active');
  const revenue = active.filter(e => !e.payment_held).reduce((s, e) => s + Number(e.amount_paid), 0);

  // Mesma mensagem que o jogador compartilha; o link abre a página do site do jogador.
  function buildShareMessage() {
    if (!cls) return '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = cls as any;
    const dayUse = cls.kind === 'day_use';
    const remaining = cls.capacity - cls.enrolled_count;
    const place = `📍 ${cls.courts?.name ?? ''}${c.venues?.name ? ` · ${c.venues.name}` : ''}`;
    const link = `${window.location.origin}/${dayUse ? 'day-use' : 'aulas'}/${cls.id}`;
    const first = sessions[0];
    const lines = dayUse
      ? [
          `☀️ Partida aberta · Day use no JoggaHub!`, ``,
          `🏟️ ${SPORT_NAMES[c.sport_type] ?? cls.title}`,
          ...(first ? [`📅 ${formatSessionDate(first.starts_at.substring(0, 10))}`, `🕐 ${first.starts_at.substring(11, 16)} – ${first.ends_at.substring(11, 16)}`] : []),
          place,
          `💰 ${formatBRL(Number(cls.price))}/pessoa`, ``,
          `👥 Jogadores (${cls.enrolled_count}/${cls.capacity}):`,
          ...active.map(e => `✅ ${e.name ?? 'Jogador'}`),
        ]
      : [
          `🎓 Curso no JoggaHub: ${cls.title}`, ``,
          `👨‍🏫 Prof. ${cls.coach_name} · ${classLevelLabel(cls.level)}`,
          `📅 ${cls.lesson_count} aulas: ${sessions.map(x => formatSessionDate(x.starts_at.substring(0, 10))).join(', ')}`,
          ...(first ? [`🕐 ${first.starts_at.substring(11, 16)} – ${first.ends_at.substring(11, 16)}`] : []),
          place,
          `💰 ${formatBRL(Number(cls.price))} o curso todo`,
        ];
    return [
      ...lines, ``,
      remaining > 0
        ? `Ainda há ${remaining} ${remaining === 1 ? 'vaga' : 'vagas'}! ${dayUse ? 'Entre' : 'Inscreva-se'} pelo JoggaHub:`
        : `${dayUse ? 'Day use' : 'Curso'} completo! Acompanhe pelo link:`,
      link,
    ].join('\n');
  }

  function handleWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(buildShareMessage())}`, '_blank');
    setShowShare(false);
  }

  function handleCopy() {
    navigator.clipboard.writeText(buildShareMessage());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl">
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-gray-900 truncate">{cls?.title ?? 'Curso'}</h2>
            {cls && <p className="text-xs text-gray-500 mt-0.5">{cls.kind === 'day_use' ? `Partida aberta · Day use · ${cls.courts?.name}` : `${cls.coach_name} · ${classLevelLabel(cls.level)} · ${cls.courts?.name}`}</p>}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
        </div>

        {!cls ? <p className="text-gray-400 text-sm text-center py-10">Carregando...</p> : (
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
            {cls.status === 'cancelled' && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-3 py-2">{cls.kind === 'day_use' ? 'Este day use foi cancelado.' : 'Este curso foi cancelado.'}</div>
            )}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-gray-50 rounded-xl py-3"><p className="text-lg font-bold text-gray-900">{cls.enrolled_count}/{cls.capacity}</p><p className="text-[11px] text-gray-500">{cls.kind === 'day_use' ? 'jogadores' : 'alunos'}</p></div>
              <div className="bg-gray-50 rounded-xl py-3"><p className="text-lg font-bold text-gray-900">{cls.kind === 'day_use' ? formatBRL(Number(cls.price)) : cls.lesson_count}</p><p className="text-[11px] text-gray-500">{cls.kind === 'day_use' ? 'por pessoa' : 'aulas'}</p></div>
              <div className="bg-gray-50 rounded-xl py-3"><p className="text-lg font-bold text-gray-900">{formatBRL(revenue)}</p><p className="text-[11px] text-gray-500">recebido</p></div>
            </div>
            {cls.description && <p className="text-sm text-gray-600 whitespace-pre-line">{cls.description}</p>}

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{cls.kind === 'day_use' ? 'Horário' : 'Aulas'}</p>
              <div className="flex flex-wrap gap-1.5">
                {sessions.map(s => (
                  <span key={s.id} className="text-xs bg-white border border-gray-200 rounded-lg px-2 py-1 text-gray-700 tabular-nums">
                    {formatSessionDate(s.starts_at.substring(0, 10))} · {s.starts_at.substring(11, 16)}–{s.ends_at.substring(11, 16)}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{cls.kind === 'day_use' ? 'Jogadores' : 'Alunos inscritos'}</p>
              {enrollments.length === 0 ? (
                <p className="text-sm text-gray-400">Ninguém inscrito ainda.</p>
              ) : (
                <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl">
                  {enrollments.map(e => (
                    <div key={e.id} className="flex items-center justify-between px-3 py-2.5">
                      <span className="text-sm text-gray-900">{e.name}</span>
                      <span className={`text-xs font-semibold ${e.status === 'active' ? 'text-green-700' : 'text-gray-400'}`}>
                        {e.status === 'active' ? `${e.payment_held ? 'Reservado' : 'Pago'} · ${formatBRL(Number(e.amount_paid))}` : e.refunded ? 'Reembolsado' : 'Cancelado'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>}
          </div>
        )}

        {cls?.status === 'active' && (
          <div className="px-6 py-4 border-t border-gray-100 space-y-2">
            {!confirming && (
              <button onClick={() => setShowShare(true)}
                className="w-full py-3 rounded-xl bg-green-500 text-white font-semibold text-sm hover:bg-green-600 flex items-center justify-center gap-2">
                <Share2 className="w-4 h-4" />{cls.kind === 'day_use' ? 'Compartilhar day use' : 'Compartilhar curso'}
              </button>
            )}
            {!confirming ? (
              <button onClick={() => setConfirming(true)} className="w-full py-3 rounded-xl border border-red-200 text-red-600 font-semibold text-sm hover:bg-red-50">
                {cls.kind === 'day_use' ? 'Cancelar day use' : 'Cancelar curso'}
              </button>
            ) : (
              <div className="space-y-3">
                <p className="flex items-start gap-2 text-sm text-gray-700">
                  <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  Os horários voltam a ficar livres na agenda{active.length ? ` e os ${active.length} aluno(s) recebem o valor total de volta` : ''}. Não dá para desfazer.
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirming(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-semibold text-sm">Voltar</button>
                  <button onClick={cancelClass} disabled={cancelling} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-bold text-sm disabled:opacity-60">
                    {cancelling ? 'Cancelando…' : 'Confirmar cancelamento'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showShare && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={() => setShowShare(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-gray-900 text-lg mb-4">{cls?.kind === 'day_use' ? 'Compartilhar day use' : 'Compartilhar curso'}</h3>
            <div className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-100 max-h-64 overflow-y-auto">
              <p className="text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wide">Mensagem gerada</p>
              <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{buildShareMessage()}</pre>
            </div>
            <div className="space-y-3">
              <button onClick={handleWhatsApp}
                className="w-full bg-green-500 text-white rounded-xl py-3.5 font-semibold flex items-center justify-center gap-3 hover:bg-green-600">
                <Share2 className="w-5 h-5" />Compartilhar via WhatsApp
              </button>
              <button onClick={handleCopy}
                className="w-full bg-gray-100 text-gray-800 rounded-xl py-3.5 font-semibold flex items-center justify-center gap-3 hover:bg-gray-200">
                {copied ? <><CheckCircle className="w-5 h-5 text-green-600" /> Copiado!</> : <><Copy className="w-5 h-5" /> Copiar mensagem</>}
              </button>
            </div>
            <button onClick={() => setShowShare(false)} className="w-full mt-3 py-2 text-sm text-gray-500 font-semibold">Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
}

const SPORT_NAMES: Record<string, string> = { football: 'Society', society: 'Society', futsal: 'Futsal', futevolei: 'Futevôlei' };
