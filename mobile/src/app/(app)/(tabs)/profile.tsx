// Port of src/app/components/Profile.tsx (web).
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BadgeCheck, Calendar, Camera, Edit2, LogOut, MapPin, Settings, Target } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/features/auth/AuthProvider';
import { declareInitialRating, fetchFutevoleiRating, fetchProfileCounts, pickAndUploadAvatar } from '@/features/profile/api';
import { PlayerStatsSection } from '@/features/profile/PlayerStatsSection';
import { AdjustLevelCard, ProfileCompletenessCard } from '@/features/profile/ProfileCards';
import { GameCountsGrid, GameInfoRows } from '@/features/profile/GameInfoRows';
import { FOOT_LABELS, POSITION_LABELS, profileCompleteness } from '@/lib/shared';
import { LevelQuiz, emptyQuizAnswers, type QuizAnswers } from '@/features/profile/LevelQuiz';
import palette from '../../../../tailwind.palette';

export default function Profile() {
  const { profile, session, signOut, refreshProfile } = useAuth();
  const userId = session!.user.id;
  const qc = useQueryClient();
  const counts = useQuery({ queryKey: ['profileCounts', userId], queryFn: () => fetchProfileCounts(userId) });
  const ratingQ = useQuery({ queryKey: ['futevoleiRating', userId], queryFn: () => fetchFutevoleiRating(userId) });

  const [uploading, setUploading] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [showLevelPicker, setShowLevelPicker] = useState(false);
  const [savingLevel, setSavingLevel] = useState(false);
  const [levelError, setLevelError] = useState('');
  const [quizAnswers, setQuizAnswers] = useState<QuizAnswers>(emptyQuizAnswers);
  const [statsVersion, setStatsVersion] = useState(0);

  // Fresh profile every time the tab is shown, like the web's refresh on mount.
  useFocusEffect(
    useCallback(() => {
      refreshProfile();
    }, [refreshProfile]),
  );

  async function changeAvatar() {
    if (uploading) return;
    setAvatarError('');
    setUploading(true);
    try {
      const url = await pickAndUploadAvatar(userId);
      if (url) await refreshProfile();
    } catch (e) {
      setAvatarError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function setLevel(rating: number) {
    setSavingLevel(true);
    setLevelError('');
    try {
      await declareInitialRating(rating);
      qc.setQueryData(['futevoleiRating', userId], { rating, matches_played: 0 });
      setShowLevelPicker(false);
    } catch (e) {
      setLevelError((e as Error).message || 'Não foi possível definir seu nível.');
    } finally {
      setSavingLevel(false);
    }
  }

  const name = profile?.name ?? 'Jogador';
  const city = profile?.location ?? '';
  const position = profile?.preferred_position ? (POSITION_LABELS[profile.preferred_position] ?? profile.preferred_position) : null;
  const foot = profile?.dominant_foot ? FOOT_LABELS[profile.dominant_foot] : null;
  const avail = profile?.availability;
  const completeness = profileCompleteness(profile);
  const c = counts.data;
  const rating = ratingQ.data;

  return (
    <View className="flex-1 bg-gray-50">
      <SafeAreaView edges={['top']} className="bg-violet-600">
        <View className="bg-violet-600 px-6 py-4 flex-row items-center justify-between">
          <Pressable onPress={() => router.navigate('/')} accessibilityLabel="Voltar ao início" hitSlop={10}>
            <ArrowLeft size={24} color="#ffffff" />
          </Pressable>
          <Text className="text-lg font-bold text-white">Meu Perfil</Text>
          <Pressable onPress={() => router.push('/settings')} accessibilityLabel="Configurações" hitSlop={10}>
            <Settings size={24} color="#ffffff" />
          </Pressable>
        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerClassName="pb-24"
        refreshControl={
          <RefreshControl
            refreshing={counts.isRefetching || ratingQ.isRefetching}
            onRefresh={() => {
              refreshProfile();
              counts.refetch();
              ratingQ.refetch();
              setStatsVersion(v => v + 1);
            }}
            tintColor={palette.violet['600']}
          />
        }
      >
        {/* Identity card */}
        <View className="bg-white px-6 py-6 mb-3">
          <View className="flex-row items-center gap-4 mb-5">
            <View>
              <Pressable onPress={changeAvatar} accessibilityLabel="Trocar foto" className="w-20 h-20 rounded-full bg-violet-100 overflow-hidden items-center justify-center border-2 border-violet-200">
                {uploading ? (
                  <ActivityIndicator color={palette.violet['400']} />
                ) : profile?.avatar_url ? (
                  <Image source={{ uri: profile.avatar_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                ) : (
                  <Text className="text-3xl font-bold text-violet-500">{name.charAt(0).toUpperCase()}</Text>
                )}
              </Pressable>
              <Pressable onPress={changeAvatar} accessibilityLabel="Trocar foto" className="absolute bottom-0 right-0 bg-violet-600 p-1.5 rounded-full border-2 border-white">
                <Camera size={12} color="#ffffff" />
              </Pressable>
            </View>

            <View className="flex-1">
              <View className="flex-row items-center gap-1.5">
                <Text className="text-xl font-bold text-gray-900 flex-shrink" numberOfLines={1}>
                  {name}
                </Text>
                {completeness.complete && <BadgeCheck size={20} color={palette.green['600']} accessibilityLabel="Perfil completo" />}
              </View>
              {!!city && (
                <View className="flex-row items-center gap-1 mt-0.5">
                  <MapPin size={14} color={palette.gray['500']} />
                  <Text className="text-sm text-gray-500 flex-1" numberOfLines={1}>
                    {city}
                  </Text>
                </View>
              )}
              <View className="flex-row items-center gap-3 mt-1">
                <Text className="text-xs text-gray-500">
                  <Text className="text-xs font-bold text-gray-900">{c?.followers ?? 0}</Text> seguidores
                </Text>
                <Text className="text-xs text-gray-500">
                  <Text className="text-xs font-bold text-gray-900">{c?.following ?? 0}</Text> seguindo
                </Text>
              </View>
              <Pressable onPress={() => router.push('/profile/edit')} className="mt-2 flex-row items-center gap-1 self-start" hitSlop={8}>
                <Edit2 size={12} color={palette.violet['600']} />
                <Text className="text-xs text-violet-600 font-semibold">Editar perfil</Text>
              </Pressable>
            </View>
          </View>

          {!!avatarError && <Text className="text-xs text-red-600 mb-3">{avatarError}</Text>}
          {!!profile?.bio && <Text className="text-sm text-gray-600 mb-4">{profile.bio}</Text>}

          <View className="flex-row flex-wrap gap-2">
            {position && (
              <View className="flex-row items-center gap-1 px-3 py-1 bg-violet-50 rounded-full border border-violet-200">
                <Target size={12} color={palette.violet['700']} />
                <Text className="text-violet-700 text-xs font-semibold">{position}</Text>
              </View>
            )}
            {foot && (
              <View className="px-3 py-1 bg-gray-100 rounded-full">
                <Text className="text-gray-700 text-xs font-semibold">🦶 {foot}</Text>
              </View>
            )}
          </View>
        </View>

        {!completeness.complete && (
          <View className="mx-5 mb-3">
            <ProfileCompletenessCard completeness={completeness} onPick={s => router.push({ pathname: '/profile/edit', params: { section: s } })} />
          </View>
        )}

        {/* Futevôlei rating */}
        {ratingQ.isPending ? (
          <View className="mx-5 mb-3 bg-white rounded-2xl border border-gray-200 p-5">
            <Text className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-3">Pontuação · Futevôlei</Text>
            <View className="flex-row items-center gap-1">
              <ActivityIndicator size="small" color={palette.gray['400']} />
              <Text className="text-sm text-gray-400">Carregando...</Text>
            </View>
          </View>
        ) : rating == null ? (
          <View className="mx-5 mb-3 bg-white rounded-2xl border border-gray-200 p-5">
            <Text className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-3">Pontuação · Futevôlei</Text>
            {showLevelPicker ? (
              <View className="gap-2">
                <LevelQuiz answers={quizAnswers} onChange={setQuizAnswers} onConfirm={setLevel} confirming={savingLevel} />
                {!!levelError && <Text className="text-sm text-red-600">{levelError}</Text>}
              </View>
            ) : (
              <View className="flex-row items-center justify-between">
                <Text className="text-sm text-gray-500 flex-1">Ainda sem partidas de futevôlei registradas.</Text>
                <Pressable onPress={() => setShowLevelPicker(true)} hitSlop={8} className="ml-2">
                  <Text className="text-sm font-semibold text-violet-600">Definir nível</Text>
                </Pressable>
              </View>
            )}
          </View>
        ) : (
          <>
            <PlayerStatsSection userId={userId} version={statsVersion} />
            <AdjustLevelCard
              currentRating={rating.rating}
              onLowered={r => {
                qc.setQueryData(['futevoleiRating', userId], { ...rating, rating: r });
                setStatsVersion(v => v + 1);
              }}
            />
          </>
        )}

        <GameCountsGrid asOrganizer={c?.asOrganizer ?? 0} asPlayer={c?.asPlayer ?? 0} />

        {/* Meu Jogo */}
        <View className="mx-5 mb-3 bg-white rounded-2xl border border-gray-200 p-5">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-sm font-bold text-gray-500 uppercase tracking-wide">Meu Jogo</Text>
            <Pressable onPress={() => router.push({ pathname: '/profile/edit', params: { section: 'jogo' } })} className="flex-row items-center gap-1" hitSlop={8}>
              <Edit2 size={12} color={palette.violet['600']} />
              <Text className="text-xs text-violet-600 font-semibold">Editar</Text>
            </Pressable>
          </View>
          <GameInfoRows position={position} foot={foot} availability={avail} />
        </View>

        {/* Actions */}
        <View className="mx-5 gap-2 mt-2">
          <Pressable onPress={() => router.push('/my-bookings')} className="w-full bg-white border border-gray-200 py-3.5 rounded-xl flex-row items-center justify-center gap-2 active:bg-gray-50">
            <Calendar size={16} color={palette.gray['700']} />
            <Text className="text-gray-700 font-semibold text-sm">Minhas Reservas</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/settings')} className="w-full bg-white border border-gray-200 py-3.5 rounded-xl flex-row items-center justify-center gap-2 active:bg-gray-50">
            <Settings size={16} color={palette.gray['700']} />
            <Text className="text-gray-700 font-semibold text-sm">Configurações</Text>
          </Pressable>
          <Pressable onPress={() => signOut().catch(() => {})} className="w-full bg-white border border-red-100 py-3.5 rounded-xl flex-row items-center justify-center gap-2 active:bg-red-50">
            <LogOut size={16} color={palette.red['500']} />
            <Text className="text-red-500 font-semibold text-sm">Sair da conta</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
