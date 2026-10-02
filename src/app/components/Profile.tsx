import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, User, MapPin, Settings, LogOut, Edit2,
  Users, Home as HomeIcon, Target, Camera,
  Clock, Calendar, Loader2,
} from 'lucide-react';
import { useAuth } from '@/app/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { FUTEVOLEI_LEVELS, type FutevoleiLevelOption } from '@/app/lib/futevoleiLevels';
import PlayerStatsSection from './PlayerStatsSection';

// ── Position labels ───────────────────────────────────────────────────────────

const POSITION_LABELS: Record<string, string> = {
  right: 'Lado direito',
  left: 'Lado esquerdo',
  both: 'Qualquer lado',
};

const FOOT_LABELS: Record<string, string> = {
  right: 'Destro',
  left: 'Canhoto',
  both: 'Ambidestro',
};

const DAY_LABELS: Record<string, string> = {
  mon: 'Seg', tue: 'Ter', wed: 'Qua', thu: 'Qui',
  fri: 'Sex', sat: 'Sáb', sun: 'Dom',
};

const PERIOD_LABELS: Record<string, string> = {
  morning: 'Manhã', afternoon: 'Tarde', evening: 'Noite',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function Profile() {
  const navigate = useNavigate();
  const { profile, user, signOut, refreshProfile } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [activeBottomTab] = useState('profile');
  const [gamesAsOrganizer, setGamesAsOrganizer] = useState(0);
  const [gamesAsPlayer, setGamesAsPlayer] = useState(0);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [futevoleiRating, setFutevoleiRating] = useState<{ rating: number; matches_played: number } | null | undefined>(undefined);
  const [showLevelPicker, setShowLevelPicker] = useState(false);
  const [savingLevel, setSavingLevel] = useState(false);

  // Always load fresh profile data on mount to avoid stale context
  useEffect(() => { refreshProfile(); }, []);

  useEffect(() => {
    if (!user) return;
    // Real game counts from DB
    Promise.all([
      supabase.from('games').select('id', { count: 'exact', head: true }).eq('organizer_id', user.id),
      supabase.from('game_players').select('id', { count: 'exact', head: true }).eq('player_id', user.id),
    ]).then(([org, player]) => {
      setGamesAsOrganizer(org.count ?? 0);
      setGamesAsPlayer(player.count ?? 0);
    });
    supabase.from('player_ratings').select('rating, matches_played')
      .eq('player_id', user.id).eq('sport_type', 'futevolei').maybeSingle()
      .then(({ data }) => setFutevoleiRating(data));
  }, [user?.id]);

  async function handleSetLevel(level: FutevoleiLevelOption) {
    if (!user) return;
    setSavingLevel(true);
    const { error } = await supabase.from('player_ratings').upsert({
      player_id: user.id,
      sport_type: 'futevolei',
      rating: level.rating,
      matches_played: 0,
    }, { onConflict: 'player_id,sport_type' });
    if (!error) {
      // Baseline history row (game_id null) so the first confirmed match's "before"
      // rating is the declared level, not the 3.0 default.
      await supabase.from('player_rating_history').insert({
        player_id: user.id,
        sport_type: 'futevolei',
        game_id: null,
        rating: level.rating,
        matches_played: 0,
      });
      setFutevoleiRating({ rating: level.rating, matches_played: 0 });
      setShowLevelPicker(false);
    }
    setSavingLevel(false);
  }

  const totalGames = gamesAsOrganizer + gamesAsPlayer;

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingAvatar(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${user.id}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true });
      if (!upErr) {
        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
        await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);
        await refreshProfile();
      }
    } finally {
      setUploadingAvatar(false);
    }
  }

  const handleSignOut = async () => {
    if (user) localStorage.removeItem(`onboarding_done_${user.id}`);
    await signOut();
    navigate('/');
  };

  const name     = profile?.name ?? 'Jogador';
  const city     = profile?.location ?? '';
  const position = profile?.preferred_position ? POSITION_LABELS[profile.preferred_position] ?? profile.preferred_position : null;
  const foot     = profile?.dominant_foot ? FOOT_LABELS[profile.dominant_foot] : null;
  const avail    = profile?.availability;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">

      {/* Header */}
      <div className="bg-violet-600 text-white px-6 py-4 flex items-center justify-between">
        <button onClick={() => navigate('/home')}><ArrowLeft className="w-6 h-6" /></button>
        <h1 className="text-lg font-bold">Meu Perfil</h1>
        <button onClick={() => navigate('/settings')}><Settings className="w-6 h-6" /></button>
      </div>

      {/* Identity card */}
      <div className="bg-white px-6 py-6 mb-3">
        <div className="flex items-center gap-4 mb-5">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div
              className="w-20 h-20 rounded-full bg-violet-100 overflow-hidden flex items-center justify-center cursor-pointer border-2 border-violet-200"
              onClick={() => fileRef.current?.click()}
            >
              {uploadingAvatar ? (
                <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
              ) : profile?.avatar_url ? (
                <img src={profile.avatar_url} alt={name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-3xl font-bold text-violet-500">{name.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              className="absolute bottom-0 right-0 bg-violet-600 text-white p-1.5 rounded-full border-2 border-white"
            >
              <Camera className="w-3 h-3" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>

          {/* Name + city */}
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-gray-900 truncate">{name}</h2>
            {city && (
              <div className="flex items-center gap-1 text-gray-500 mt-0.5">
                <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="text-sm truncate">{city}</span>
              </div>
            )}
            <button
              onClick={() => navigate('/onboarding')}
              className="mt-2 flex items-center gap-1 text-xs text-violet-600 font-semibold"
            >
              <Edit2 className="w-3 h-3" /> Editar perfil
            </button>
          </div>
        </div>

        {/* Tags: position + foot */}
        <div className="flex flex-wrap gap-2">
          {position && (
            <span className="flex items-center gap-1 px-3 py-1 bg-violet-50 text-violet-700 rounded-full text-xs font-semibold border border-violet-200">
              <Target className="w-3 h-3" /> {position}
            </span>
          )}
          {foot && (
            <span className="flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-semibold">
              🦶 {foot}
            </span>
          )}
        </div>
      </div>

      {/* Pontuação — rating de futevôlei */}
      {futevoleiRating === undefined ? (
        <div className="mx-5 mb-3 bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-3">Pontuação · Futevôlei</p>
          <div className="flex items-center gap-1 text-sm text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
          </div>
        </div>
      ) : futevoleiRating === null ? (
        <div className="mx-5 mb-3 bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-3">Pontuação · Futevôlei</p>
          {showLevelPicker ? (
            <div className="flex flex-col gap-2">
              {FUTEVOLEI_LEVELS.map(l => (
                <button
                  key={l.key}
                  disabled={savingLevel}
                  onClick={() => handleSetLevel(l)}
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl border-2 border-gray-200 text-left hover:border-violet-300 disabled:opacity-50"
                >
                  <div>
                    <div className="font-semibold text-sm text-gray-900">{l.label}</div>
                    <div className="text-xs text-gray-400">{l.description}</div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">Ainda sem partidas de futevôlei registradas.</p>
              <button onClick={() => setShowLevelPicker(true)} className="text-sm font-semibold text-violet-600 flex-shrink-0 ml-2">
                Definir nível
              </button>
            </div>
          )}
        </div>
      ) : user && (
        <PlayerStatsSection userId={user.id} />
      )}

      {/* Stats */}
      <div className="mx-5 mb-3">
        <p className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-2">Estatísticas</p>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white rounded-xl p-4 border border-gray-200 text-center">
            <div className="text-2xl font-bold text-violet-600 mb-0.5">{totalGames}</div>
            <div className="text-xs text-gray-500">Partidas</div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200 text-center">
            <div className="text-2xl font-bold text-orange-500 mb-0.5">{gamesAsOrganizer}</div>
            <div className="text-xs text-gray-500">Organizadas</div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200 text-center">
            <div className="text-2xl font-bold text-blue-500 mb-0.5">{gamesAsPlayer}</div>
            <div className="text-xs text-gray-500">Como jogador</div>
          </div>
        </div>
      </div>

      {/* Player profile card */}
      <div className="mx-5 mb-3 bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-bold text-gray-500 uppercase tracking-wide">Meu Jogo</p>
          <button
            onClick={() => navigate('/onboarding')}
            className="flex items-center gap-1 text-xs text-violet-600 font-semibold"
          >
            <Edit2 className="w-3 h-3" /> Editar
          </button>
        </div>

        <div className="space-y-3">
          {/* Position */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Target className="w-4 h-4 flex-shrink-0" />
              <span>Posição preferida</span>
            </div>
            {position
              ? <span className="text-sm font-semibold text-gray-900">{position}</span>
              : <span className="text-sm text-gray-300">—</span>}
          </div>

          {/* Foot */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span className="text-base leading-none">🦶</span>
              <span>Pé dominante</span>
            </div>
            {foot
              ? <span className="text-sm font-semibold text-gray-900">{foot}</span>
              : <span className="text-sm text-gray-300">—</span>}
          </div>

          {/* Availability days */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-gray-500 flex-shrink-0 pt-0.5">
              <Calendar className="w-4 h-4" />
              <span>Dias</span>
            </div>
            {(avail?.days?.length ?? 0) > 0
              ? <div className="flex flex-wrap gap-1.5 justify-end">
                  {avail!.days!.map(d => (
                    <span key={d} className="px-2.5 py-1 bg-violet-50 text-violet-700 text-xs font-semibold rounded-full border border-violet-100">
                      {DAY_LABELS[d] ?? d}
                    </span>
                  ))}
                </div>
              : <span className="text-sm text-gray-300">—</span>}
          </div>

          {/* Availability periods */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Clock className="w-4 h-4" />
              <span>Horário</span>
            </div>
            {(avail?.periods?.length ?? 0) > 0
              ? <div className="flex gap-2">
                  {avail!.periods!.map(p => (
                    <span key={p} className="text-xs font-semibold text-gray-700 bg-gray-100 px-2.5 py-1 rounded-full">
                      {PERIOD_LABELS[p] ?? p}
                    </span>
                  ))}
                </div>
              : <span className="text-sm text-gray-300">—</span>}
          </div>
        </div>

        {!profile?.onboarding_completed && (
          <button
            onClick={() => navigate('/onboarding')}
            className="mt-4 w-full py-2.5 border border-dashed border-violet-300 text-violet-500 rounded-xl text-xs font-semibold"
          >
            + Completar informações de jogador
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="mx-5 space-y-2 mt-2">
        <button
          onClick={() => navigate('/my-bookings')}
          className="w-full bg-white border border-gray-200 text-gray-700 py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors text-sm"
        >
          <Calendar className="w-4 h-4" /> Minhas Reservas
        </button>
        <button
          onClick={() => navigate('/settings')}
          className="w-full bg-white border border-gray-200 text-gray-700 py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors text-sm"
        >
          <Settings className="w-4 h-4" /> Configurações
        </button>
        <button
          onClick={handleSignOut}
          className="w-full bg-white border border-red-100 text-red-500 py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-red-50 transition-colors text-sm"
        >
          <LogOut className="w-4 h-4" /> Sair da conta
        </button>
      </div>

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-3 max-w-md mx-auto">
        <div className="flex items-center justify-around">
          <button onClick={() => navigate('/home')} className={`flex flex-col items-center gap-1 ${activeBottomTab === 'home' ? 'text-violet-600' : 'text-gray-400'}`}>
            <HomeIcon className="w-6 h-6" /><span className="text-xs">Início</span>
          </button>
          <button onClick={() => navigate('/community')} className={`flex flex-col items-center gap-1 ${activeBottomTab === 'community' ? 'text-violet-600' : 'text-gray-400'}`}>
            <Users className="w-6 h-6" /><span className="text-xs">Comunidade</span>
          </button>
          <button onClick={() => navigate('/profile')} className="flex flex-col items-center gap-1 text-violet-600">
            <User className="w-6 h-6" /><span className="text-xs">Perfil</span>
          </button>
        </div>
      </div>
    </div>
  );
}
