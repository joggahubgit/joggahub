import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Send, Loader2 } from 'lucide-react';
import { useAuth } from '@/app/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

interface ChatMessage {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

interface SenderInfo {
  name: string;
  avatarUrl: string | null;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** Group chat scoped to a single game's roster (organizer + game_players). */
export default function GameChat() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [senders, setSenders] = useState<Record<string, SenderInfo>>({});
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [gameLabel, setGameLabel] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function load() {
      const { data: game } = await supabase
        .from('games')
        .select('sport_type, organizer_id, courts(name)')
        .eq('id', id)
        .maybeSingle();
      if (!cancelled && game) {
        const sport = game.sport_type === 'futevolei' ? 'Futevôlei' : game.sport_type;
        setGameLabel(`${sport}${(game as any).courts?.name ? ' · ' + (game as any).courts.name : ''}`);
      }

      const { data: rows } = await supabase
        .from('game_messages')
        .select('id, sender_id, body, created_at')
        .eq('game_id', id)
        .order('created_at', { ascending: true });
      if (cancelled) return;
      setMessages(rows ?? []);

      const { data: players } = await supabase.from('game_players').select('player_id, player_name').eq('game_id', id);
      const senderIds = [...new Set([game?.organizer_id, ...(players ?? []).map(p => p.player_id)].filter(Boolean))] as string[];
      const { data: profiles } = await supabase.from('profiles').select('id, name, avatar_url').in('id', senderIds);
      if (cancelled) return;
      const map: Record<string, SenderInfo> = {};
      (profiles ?? []).forEach(p => { map[p.id] = { name: p.name ?? 'Jogador', avatarUrl: p.avatar_url ?? null }; });
      setSenders(map);
      setLoading(false);
    }

    load();

    const channel = supabase
      .channel(`game-chat-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_messages', filter: `game_id=eq.${id}` }, (payload) => {
        setMessages(prev => [...prev, payload.new as ChatMessage]);
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function handleSend() {
    const text = body.trim();
    if (!text || !id || !user) return;
    setSending(true);
    setError('');
    const { error: insertErr } = await supabase.from('game_messages').insert({
      game_id: id,
      sender_id: user.id,
      body: text,
    });
    if (insertErr) {
      setError('Não foi possível enviar. Tente novamente.');
    } else {
      setBody('');
    }
    setSending(false);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-violet-600 text-white px-6 py-4 flex items-center gap-3 flex-shrink-0">
        <button onClick={() => navigate(-1)}><ArrowLeft className="w-6 h-6" /></button>
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-tight">Chat da partida</h1>
          {gameLabel && <p className="text-xs text-violet-100 truncate">{gameLabel}</p>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">Nenhuma mensagem ainda. Comece a conversa!</p>
        ) : (
          messages.map(m => {
            const mine = m.sender_id === user?.id;
            const sender = senders[m.sender_id];
            return (
              <div key={m.id} className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                {!mine && (
                  sender?.avatarUrl ? (
                    <img src={sender.avatarUrl} alt={sender.name} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-violet-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {(sender?.name ?? '?').charAt(0).toUpperCase()}
                    </div>
                  )
                )}
                <div className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 ${mine ? 'bg-violet-600 text-white rounded-br-sm' : 'bg-white border border-gray-200 text-gray-900 rounded-bl-sm'}`}>
                  {!mine && <p className="text-[11px] font-semibold text-violet-600 mb-0.5">{sender?.name ?? 'Jogador'}</p>}
                  <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={`text-[10px] mt-1 ${mine ? 'text-violet-200' : 'text-gray-400'}`}>{formatTime(m.created_at)}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p className="px-4 text-xs text-red-600 mb-1">{error}</p>}

      <div className="border-t border-gray-200 bg-white px-4 py-3 flex items-center gap-2 flex-shrink-0">
        <input
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Escreva uma mensagem..."
          className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-full text-sm focus:border-violet-500 focus:outline-none"
        />
        <button
          onClick={handleSend}
          disabled={sending || !body.trim()}
          className="w-10 h-10 bg-violet-600 text-white rounded-full flex items-center justify-center disabled:opacity-40 flex-shrink-0"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
