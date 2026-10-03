import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, User, MapPin, Users, Home as HomeIcon, Target,
  Clock, Calendar, Loader2, UserPlus, UserCheck,
} from 'lucide-react';
import { useAuth } from '@/app/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import PlayerStatsSection from './PlayerStatsSection';

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

interface PublicProfileData {
  name: string;
  avatar_url: string | null;
  location: string | null;
  preferred_position: string | null;
  dominant_foot: string | null;
  availability: { days?: string[]; periods?: string[] } | null;
}

/** Read-only view of another player's profile — reached by tapping their name/avatar in the ranking. */
export default function PublicProfile() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user: viewer } = useAuth();

  const [profile, setProfile] = useState<PublicProfileData | null | undefined>(undefined);
  const [gamesAsOrganizer, setGamesAsOrganizer] = useState(0);
  const [gamesAsPlayer, setGamesAsPlayer] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  useEffect(() => {
    // Viewing your own row in the ranking should land on the real (editable) profile.
    if (id && viewer?.id === id) {
      navigate('/profile', { replace: true });
    }
  }, [id, viewer?.id]);

  useEffect(() => {
    if (!id) return;
    supabase
      .from('profiles')
      .select('name, avatar_url, location, preferred_position, dominant_foot, availability')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => setProfile(data as PublicProfileData | null));

    Promise.all([
      supabase.from('games').select('id', { count: 'exact', head: true }).eq('organizer_id', id),
      supabase.from('game_players').select('id', { count: 'exact', head: true }).eq('player_id', id),
    ]).then(([org, player]) => {
      setGamesAsOrganizer(org.count ?? 0);
      setGamesAsPlayer(player.count ?? 0);
    });

    supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', id)
      .then(({ count }) => setFollowerCount(count ?? 0));
    supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', id)
      .then(({ count }) => setFollowingCount(count ?? 0));
    if (viewer) {
      supabase.from('follows').select('follower_id').eq('follower_id', viewer.id).eq('following_id', id).maybeSingle()
        .then(({ data }) => setIsFollowing(!!data));
    }
  }, [id, viewer?.id]);

  async function toggleFollow() {
    if (!viewer || !id || followLoading) return;
    setFollowLoading(true);
    if (isFollowing) {
      const { error } = await supabase.from('follows').delete().eq('follower_id', viewer.id).eq('following_id', id);
      if (!error) { setIsFollowing(false); setFollowerCount(c => Math.max(0, c - 1)); }
    } else {
      const { error } = await supabase.from('follows').insert({ follower_id: viewer.id, following_id: id });
      if (!error) { setIsFollowing(true); setFollowerCount(c => c + 1); }
    }
    setFollowLoading(false);
  }

  if (profile === undefined) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
      </div>
    );
  }

  if (profile === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-gray-500">Jogador não encontrado.</p>
        <button onClick={() => navigate('/community')} className="text-sm font-semibold text-violet-600">Voltar</button>
      </div>
    );
  }

  const name     = profile.name ?? 'Jogador';
  const city     = profile.location ?? '';
  const position = profile.preferred_position ? POSITION_LABELS[profile.preferred_position] ?? profile.preferred_position : null;
  const foot     = profile.dominant_foot ? FOOT_LABELS[profile.dominant_foot] : null;
  const avail    = profile.availability;
  const totalGames = gamesAsOrganizer + gamesAsPlayer;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-violet-600 text-white px-6 py-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)}><ArrowLeft className="w-6 h-6" /></button>
        <h1 className="text-lg font-bold truncate">{name}</h1>
      </div>

      {/* Identity card */}
      <div className="bg-white px-6 py-6 mb-3">
        <div className="flex items-center gap-4 mb-5">
          <div className="w-20 h-20 rounded-full bg-violet-100 overflow-hidden flex items-center justify-center flex-shrink-0 border-2 border-violet-200">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-3xl font-bold text-violet-500">{name.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-gray-900 truncate">{name}</h2>
            {city && (
              <div className="flex items-center gap-1 text-gray-500 mt-0.5">
                <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="text-sm truncate">{city}</span>
              </div>
            )}
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
              <span><strong className="text-gray-900">{followerCount}</strong> seguidores</span>
              <span><strong className="text-gray-900">{followingCount}</strong> seguindo</span>
            </div>
          </div>
          <button
            onClick={toggleFollow}
            disabled={followLoading}
            className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-60 ${
              isFollowing ? 'bg-gray-100 text-gray-700 border border-gray-200' : 'bg-violet-600 text-white'
            }`}
          >
            {followLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isFollowing ? (
              <><UserCheck className="w-4 h-4" /> Seguindo</>
            ) : (
              <><UserPlus className="w-4 h-4" /> Seguir</>
            )}
          </button>
        </div>

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

      {/* Pontuação + jogos + estatísticas de futevôlei */}
      {id && <PlayerStatsSection userId={id} />}

      {/* Stats gerais (todos os esportes) */}
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

      {/* Meu Jogo (read-only) */}
      {(position || foot || (avail?.days?.length ?? 0) > 0 || (avail?.periods?.length ?? 0) > 0) && (
        <div className="mx-5 mb-3 bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-4">Jogo</p>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Target className="w-4 h-4 flex-shrink-0" />
                <span>Posição preferida</span>
              </div>
              {position
                ? <span className="text-sm font-semibold text-gray-900">{position}</span>
                : <span className="text-sm text-gray-300">—</span>}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span className="text-base leading-none">🦶</span>
                <span>Pé dominante</span>
              </div>
              {foot
                ? <span className="text-sm font-semibold text-gray-900">{foot}</span>
                : <span className="text-sm text-gray-300">—</span>}
            </div>

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
        </div>
      )}

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-3 max-w-md mx-auto">
        <div className="flex items-center justify-around">
          <button onClick={() => navigate('/home')} className="flex flex-col items-center gap-1 text-gray-400">
            <HomeIcon className="w-6 h-6" /><span className="text-xs">Início</span>
          </button>
          <button onClick={() => navigate('/community')} className="flex flex-col items-center gap-1 text-violet-600">
            <Users className="w-6 h-6" /><span className="text-xs">Comunidade</span>
          </button>
          <button onClick={() => navigate('/profile')} className="flex flex-col items-center gap-1 text-gray-400">
            <User className="w-6 h-6" /><span className="text-xs">Perfil</span>
          </button>
        </div>
      </div>
    </div>
  );
}
