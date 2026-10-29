// Port of src/app/components/PublicProfile.tsx (web).
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BadgeCheck, MapPin, Target, UserCheck, UserPlus } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/features/auth/AuthProvider';
import { fetchProfileCounts } from '@/features/profile/api';
import { fetchIsFollowing, fetchPublicProfile, setFollowing } from '@/features/profile/publicApi';
import { PlayerStatsSection } from '@/features/profile/PlayerStatsSection';
import { GameCountsGrid, GameInfoRows } from '@/features/profile/GameInfoRows';
import { FOOT_LABELS, POSITION_LABELS, profileCompleteness } from '@/lib/shared';
import palette from '../../../../tailwind.palette';

export default function PublicProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const viewerId = session!.user.id;
  const qc = useQueryClient();

  const profileQ = useQuery({ queryKey: ['publicProfile', id], queryFn: () => fetchPublicProfile(id), enabled: !!id && id !== viewerId });
  const counts = useQuery({ queryKey: ['profileCounts', id], queryFn: () => fetchProfileCounts(id), enabled: !!id && id !== viewerId });
  const followQ = useQuery({ queryKey: ['isFollowing', viewerId, id], queryFn: () => fetchIsFollowing(viewerId, id), enabled: !!id && id !== viewerId });
  const [busy, setBusy] = useState(false);
  const [followOverride, setIsFollowing] = useState<boolean | null>(null);
  const isFollowing = followOverride ?? followQ.data ?? false;

  // Your own row in the ranking opens the editable profile, like the web.
  if (id === viewerId) return <Redirect href="/profile" />;

  async function toggleFollow() {
    if (busy) return;
    setBusy(true);
    const next = !isFollowing;
    try {
      await setFollowing(viewerId, id, next);
      setIsFollowing(next);
      qc.setQueryData(['profileCounts', id], (c: { followers: number } | undefined) => (c ? { ...c, followers: Math.max(0, c.followers + (next ? 1 : -1)) } : c));
      qc.invalidateQueries({ queryKey: ['profileCounts', viewerId] });
    } catch {
      // Same as the web: state only changes when the write succeeds.
    } finally {
      setBusy(false);
    }
  }

  if (profileQ.isPending) {
    return (
      <View className="flex-1 bg-gray-50 items-center justify-center">
        <ActivityIndicator color={palette.violet['400']} />
      </View>
    );
  }
  if (!profileQ.data) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 items-center justify-center gap-3 px-6">
        <Text className="text-sm text-gray-500">{profileQ.isError ? 'Não foi possível carregar o jogador.' : 'Jogador não encontrado.'}</Text>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/community'))}>
          <Text className="text-sm font-semibold text-violet-600">Voltar</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const p = profileQ.data;
  const name = p.name ?? 'Jogador';
  const position = p.preferred_position ? (POSITION_LABELS[p.preferred_position] ?? p.preferred_position) : null;
  const foot = p.dominant_foot ? FOOT_LABELS[p.dominant_foot] : null;
  const avail = p.availability;
  const c = counts.data;
  const showGame = !!(position || foot || avail?.days?.length || avail?.periods?.length);

  return (
    <View className="flex-1 bg-gray-50">
      <SafeAreaView edges={['top']} className="bg-violet-600">
        <View className="bg-violet-600 px-6 py-4 flex-row items-center gap-3">
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/community'))} accessibilityLabel="Voltar" hitSlop={10}>
            <ArrowLeft size={24} color="#ffffff" />
          </Pressable>
          <Text className="text-lg font-bold text-white flex-1" numberOfLines={1}>
            {name}
          </Text>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerClassName="pb-24">
        <View className="bg-white px-6 py-6 mb-3">
          <View className="flex-row items-center gap-4 mb-5">
            <View className="w-20 h-20 rounded-full bg-violet-100 overflow-hidden items-center justify-center border-2 border-violet-200">
              {p.avatar_url ? (
                <Image source={{ uri: p.avatar_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" accessibilityLabel={name} />
              ) : (
                <Text className="text-3xl font-bold text-violet-500">{name.charAt(0).toUpperCase()}</Text>
              )}
            </View>
            <View className="flex-1">
              <View className="flex-row items-center gap-1.5">
                <Text className="text-xl font-bold text-gray-900 flex-shrink" numberOfLines={1}>
                  {name}
                </Text>
                {profileCompleteness(p).complete && <BadgeCheck size={20} color={palette.green['600']} accessibilityLabel="Perfil completo" />}
              </View>
              {!!p.location && (
                <View className="flex-row items-center gap-1 mt-0.5">
                  <MapPin size={14} color={palette.gray['500']} />
                  <Text className="text-sm text-gray-500 flex-1" numberOfLines={1}>
                    {p.location}
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
            </View>
            <Pressable
              onPress={toggleFollow}
              disabled={busy}
              accessibilityRole="button"
              className={`flex-row items-center gap-1.5 px-4 py-2 rounded-full ${busy ? 'opacity-60' : ''} ${isFollowing ? 'bg-gray-100 border border-gray-200' : 'bg-violet-600'}`}
            >
              {busy ? (
                <ActivityIndicator size="small" color={isFollowing ? palette.gray['700'] : '#ffffff'} />
              ) : isFollowing ? (
                <>
                  <UserCheck size={16} color={palette.gray['700']} />
                  <Text className="text-sm font-semibold text-gray-700">Seguindo</Text>
                </>
              ) : (
                <>
                  <UserPlus size={16} color="#ffffff" />
                  <Text className="text-sm font-semibold text-white">Seguir</Text>
                </>
              )}
            </Pressable>
          </View>

          {!!p.bio && <Text className="text-sm text-gray-600 mb-4">{p.bio}</Text>}
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

        <PlayerStatsSection userId={id} />
        <GameCountsGrid asOrganizer={c?.asOrganizer ?? 0} asPlayer={c?.asPlayer ?? 0} />

        {showGame && (
          <View className="mx-5 mb-3 bg-white rounded-2xl border border-gray-200 p-5">
            <Text className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-4">Jogo</Text>
            <GameInfoRows position={position} foot={foot} availability={avail} />
          </View>
        )}
      </ScrollView>
    </View>
  );
}
