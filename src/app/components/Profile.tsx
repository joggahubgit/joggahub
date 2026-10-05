import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, MapPin, Settings, LogOut, Edit2,
  Target, Camera,
  Clock, Calendar, Loader2, BadgeCheck,
} from 'lucide-react';
import { useAuth } from '@/app/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { FUTEVOLEI_LEVELS, type FutevoleiLevelOption } from '@/app/lib/futevoleiLevels';
import PlayerStatsSection from './PlayerStatsSection';
import { AdjustLevelCard } from './AdjustLevelCard';
import BottomNav from './BottomNav';
import { ProfileCompletenessCard } from './ProfileCompletenessCard';
import { POSITION_LABELS, FOOT_LABELS, DAY_LABELS, PERIOD_LABELS, profileCompleteness } from '@/app/lib/profileFields';

// ── Component ─────────────────────────────────────────────────────────────────

export default function Profile() {
  const navigate = useNavigate();
  const { profile, user, signOut, refreshProfile } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [gamesAsOrganizer, setGamesAsOrganizer] = useState(0);
  const [gamesAsPlayer, setGamesAsPlayer] = useState(0);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [futevoleiRating, setFutevoleiRating] = useState<{ rating: number; matches_played: number } | null | undefined>(undefined);
  const [showLevelPicker, setShowLevelPicker] = useState(false);
  const [savingLevel, setSavingLevel] = useState(false);
  const [levelError, setLevelError] = useState('');
  const [statsVersion, setStatsVersion] = useState(0); // remounts PlayerStatsSection after a level change
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

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
    supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', user.id)
      .then(({ count }) => setFollowerCount(count ?? 0));
    supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', user.id)
      .then(({ count }) => setFollowingCount(count ?? 0));
  }, [user?.id]);

  async function handleSetLevel(level: FutevoleiLevelOption) {
    if (!user) return;
    setSavingLevel(true);
    setLevelError('');
    // One-time self-declared level; the function also writes the baseline
    // history point and enforces the rules server-side
    const { error } = await supabase.rpc('declare_initial_rating', { p_sport: 'futevolei', p_rating: level.rating });
    if (error) {
      setLevelError(error.message || 'Não foi possível definir seu nível.');
    } else {
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
    setAvatarError('');
    try {
      const ext = file.name.split('.').pop();
      const path = `${user.id}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true });
      if (upErr) {
        setAvatarError('Não foi possível enviar a foto. Tente novamente.');
        return;
      }
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      const { error: updateErr } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);
      if (updateErr) {
        setAvatarError('Foto enviada, mas não foi possível salvar no seu perfil.');
        return;
      }
      await refreshProfile();
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
  const completeness = profileCompleteness(profile);

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
            <div className="flex items-center gap-1.5 min-w-0">
              <h2 className="text-xl font-bold text-gray-900 truncate">{name}</h2>
              {completeness.complete && <BadgeCheck className="w-5 h-5 text-green-600 flex-shrink-0" aria-label="Perfil completo" />}
            </div>
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
            <button
              onClick={() => navigate('/profile/edit')}
              className="mt-2 flex items-center gap-1 text-xs text-violet-600 font-semibold"
            >
              <Edit2 className="w-3 h-3" /> Editar perfil
            </button>
          </div>
        </div>

        {avatarError && <p className="text-xs text-red-600 mb-3">{avatarError}</p>}

        {profile?.bio && <p className="text-sm text-gray-600 mb-4 whitespace-pre-line">{profile.bio}</p>}

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

      {/* Perfil completo / o que falta */}
      {!completeness.complete && (
        <div className="mx-5 mb-3">
          <ProfileCompletenessCard completeness={completeness} onPick={s => navigate(`/profile/edit?section=${s}`)} />
        </div>
      )}

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
              {levelError && <p className="text-sm text-red-600">{levelError}</p>}
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
        <>
          <PlayerStatsSection key={statsVersion} userId={user.id} />
          <AdjustLevelCard
            currentRating={futevoleiRating.rating}
            onLowered={rating => {
              setFutevoleiRating(r => (r ? { ...r, rating } : r));
              setStatsVersion(v => v + 1);
            }}
          />
        </>
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
            onClick={() => navigate('/profile/edit?section=jogo')}
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

      <BottomNav />
    </div>
  );
}
