// Port of src/app/components/EditProfile.tsx (web). One save per section;
// ?section=<id> scrolls to and highlights a section. Sections are keyed by
// their saved values so they reset after a save (the web re-syncs with effects).
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View, type ScrollViewInstance } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Camera, Check, CheckCircle2, LocateFixed } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/features/auth/AuthProvider';
import { pickAvatar, updateProfile, uploadAvatar, type PickedImage } from '@/features/profile/api';
import { detectCity } from '@/features/profile/detectCity';
import { ProfileCompletenessCard } from '@/features/profile/ProfileCards';
import type { Profile } from '@/lib/supabase';
import { DAY_OPTIONS, FOOT_OPTIONS, PERIOD_OPTIONS, POSITION_OPTIONS, profileCompleteness, type ProfileSection } from '@/lib/shared';
import palette from '../../../../tailwind.palette';

const BIO_MAX = 160;
type SaveFn = (fields: Partial<Profile>) => Promise<string | null>;
const inputStyle = { fontFamily: 'Inter_400Regular' };

function Section({
  title, hint, highlight, dirty, canSave = true, onSave, onLayoutY, children,
}: {
  title: string;
  hint?: string;
  highlight: boolean;
  dirty: boolean;
  canSave?: boolean;
  onSave: () => Promise<string | null>;
  onLayoutY: (y: number) => void;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    if (busy) return;
    setBusy(true);
    setError('');
    const err = await onSave();
    setBusy(false);
    if (err) return setError(err);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const disabled = busy || !dirty || !canSave;
  return (
    <View
      onLayout={e => onLayoutY(e.nativeEvent.layout.y)}
      className={`bg-white rounded-2xl p-5 ${highlight ? 'border-2 border-violet-400' : 'border border-gray-200'}`}
      style={highlight ? { shadowColor: palette.violet['100'], shadowOpacity: 1, shadowRadius: 8, elevation: 4 } : undefined}
    >
      <Text className="font-bold text-gray-900 text-base">{title}</Text>
      {!!hint && <Text className="text-xs text-gray-400 mt-0.5">{hint}</Text>}
      <View className="mt-4">{children}</View>
      {!!error && <Text className="mt-3 text-sm text-red-600">{error}</Text>}
      <View className="mt-4 flex-row justify-end">
        <Pressable onPress={handleSave} disabled={disabled} className={`flex-row items-center gap-1.5 px-4 py-2 rounded-xl ${disabled ? 'bg-gray-100' : 'bg-violet-600'}`}>
          {busy ? <ActivityIndicator size="small" color="#ffffff" /> : saved ? <CheckCircle2 size={16} color={disabled ? palette.gray['400'] : '#ffffff'} /> : null}
          <Text className={`text-sm font-semibold ${disabled ? 'text-gray-400' : 'text-white'}`}>{saved && !dirty ? 'Salvo' : 'Salvar'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function OptionButton({ selected, onPress, children, className = '' }: { selected: boolean; onPress: () => void; children: ReactNode; className?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`flex-1 rounded-xl border-2 ${selected ? 'border-violet-600 bg-violet-50' : 'border-gray-200'} ${className}`}
    >
      {children}
      {selected && (
        <View className="absolute top-1.5 right-1.5 w-4 h-4 bg-violet-600 rounded-full items-center justify-center">
          <Check size={10} color="#ffffff" />
        </View>
      )}
    </Pressable>
  );
}

export default function EditProfile() {
  const { section } = useLocalSearchParams<{ section?: ProfileSection }>();
  const { session, profile, refreshProfile } = useAuth();
  const userId = session!.user.id;
  const scrollRef = useRef<ScrollViewInstance>(null);
  const positions = useRef<Partial<Record<ProfileSection, number>>>({});
  const [focus, setFocus] = useState<ProfileSection | null>(section ?? null);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  useEffect(() => {
    if (!focus) return;
    const t = setTimeout(() => {
      const y = positions.current[focus];
      if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 80), animated: true });
    }, 200);
    return () => clearTimeout(t);
  }, [focus]);

  const recordY = useCallback((s: ProfileSection, y: number) => {
    positions.current[s] = y;
  }, []);

  const save: SaveFn = async fields => {
    try {
      await updateProfile(userId, fields);
      await refreshProfile();
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  };

  if (!profile) {
    return (
      <View className="flex-1 bg-gray-50 items-center justify-center">
        <ActivityIndicator color={palette.violet['400']} />
      </View>
    );
  }


  return (
    <View className="flex-1 bg-gray-50">
      <SafeAreaView edges={['top']} className="bg-violet-600">
        <View className="bg-violet-600 px-6 py-4 flex-row items-center gap-3">
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} accessibilityLabel="Voltar" hitSlop={10}>
            <ArrowLeft size={24} color="#ffffff" />
          </Pressable>
          <Text className="text-lg font-bold text-white">Editar perfil</Text>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scrollRef} contentContainerClassName="px-5 pt-5 pb-16 gap-4" keyboardShouldPersistTaps="handled">
          <ProfileCompletenessCard completeness={profileCompleteness(profile)} onPick={setFocus} />
          <IdentitySection key={`${profile.name}|${profile.avatar_url}`} profile={profile} userId={userId} save={save} highlight={focus === 'identidade'} onLayoutY={y => recordY('identidade', y)} />
          <CitySection key={profile.location ?? ''} profile={profile} save={save} highlight={focus === 'cidade'} onLayoutY={y => recordY('cidade', y)} />
          <GameSection key={`${profile.preferred_position}|${profile.dominant_foot}`} profile={profile} save={save} highlight={focus === 'jogo'} onLayoutY={y => recordY('jogo', y)} />
          <AvailabilitySection key={JSON.stringify(profile.availability)} profile={profile} save={save} highlight={focus === 'disponibilidade'} onLayoutY={y => recordY('disponibilidade', y)} />
          <BioSection key={profile.bio ?? ''} profile={profile} save={save} highlight={focus === 'bio'} onLayoutY={y => recordY('bio', y)} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

type SectionProps = { profile: Profile; save: SaveFn; highlight: boolean; onLayoutY: (y: number) => void };

function IdentitySection({ profile, userId, save, highlight, onLayoutY }: SectionProps & { userId: string }) {
  const [name, setName] = useState(profile.name ?? '');
  const [image, setImage] = useState<PickedImage | null>(null);
  const preview = image?.uri ?? profile.avatar_url;

  async function onSave() {
    let avatar_url = profile.avatar_url;
    if (image) {
      try {
        avatar_url = await uploadAvatar(userId, image);
      } catch (e) {
        return (e as Error).message;
      }
    }
    return save({ name: name.trim(), avatar_url });
  }

  const dirty = !!image || name.trim() !== (profile.name ?? '');
  return (
    <Section title="Foto e nome" highlight={highlight} dirty={dirty} canSave={name.trim().length > 0} onSave={onSave} onLayoutY={onLayoutY}>
      <View className="flex-row items-center gap-4">
        <Pressable
          onPress={async () => {
            const picked = await pickAvatar();
            if (picked) setImage(picked);
          }}
          accessibilityLabel="Escolher foto"
          className="w-20 h-20 rounded-full bg-violet-100 overflow-hidden items-center justify-center border-2 border-violet-200"
        >
          {preview ? (
            <Image source={{ uri: preview }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          ) : (
            <Text className="text-3xl font-bold text-violet-400">{(name || '?').charAt(0).toUpperCase()}</Text>
          )}
          <View className="absolute bottom-0 left-0 right-0 bg-black/40 items-center py-1">
            <Camera size={14} color="#ffffff" />
          </View>
        </Pressable>
        <View className="flex-1">
          <Text className="text-xs font-semibold text-gray-500 mb-1">Nome</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            maxLength={60}
            placeholder="João Silva"
            placeholderTextColor={palette.gray['400']}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base text-gray-900"
            style={inputStyle}
            autoComplete="name"
          />
        </View>
      </View>
    </Section>
  );
}

function CitySection({ profile, save, highlight, onLayoutY }: SectionProps) {
  const [city, setCity] = useState(profile.location ?? '');
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState('');

  async function locate() {
    setLocating(true);
    setLocateError('');
    try {
      setCity(await detectCity());
    } catch (e) {
      setLocateError((e as Error)?.message ?? 'Não foi possível identificar sua cidade.');
    } finally {
      setLocating(false);
    }
  }

  return (
    <Section
      title="Cidade"
      hint="Usada no ranking da sua cidade"
      highlight={highlight}
      dirty={city.trim() !== (profile.location ?? '')}
      canSave={city.trim().length > 0}
      onSave={() => save({ location: city.trim() })}
      onLayoutY={onLayoutY}
    >
      <View className="flex-row items-center border-2 border-gray-200 rounded-xl pr-3">
        <TextInput
          value={city}
          onChangeText={t => {
            setCity(t);
            setLocateError('');
          }}
          placeholder="São Paulo, SP"
          placeholderTextColor={palette.gray['400']}
          maxLength={80}
          className="flex-1 px-4 py-3 text-base text-gray-900"
          style={inputStyle}
        />
        <Pressable onPress={locate} disabled={locating} accessibilityLabel="Usar minha localização" hitSlop={8}>
          {locating ? <ActivityIndicator size="small" color={palette.violet['600']} /> : <LocateFixed size={20} color={palette.violet['600']} />}
        </Pressable>
      </View>
      {!!locateError && <Text className="text-xs text-red-500 mt-1.5">{locateError}</Text>}
    </Section>
  );
}

function GameSection({ profile, save, highlight, onLayoutY }: SectionProps) {
  const [position, setPosition] = useState(profile.preferred_position ?? '');
  const [foot, setFoot] = useState<string>(profile.dominant_foot ?? '');
  const dirty = position !== (profile.preferred_position ?? '') || foot !== (profile.dominant_foot ?? '');

  return (
    <Section
      title="Como você joga"
      highlight={highlight}
      dirty={dirty}
      canSave={!!position && !!foot}
      onSave={() => save({ preferred_position: position, dominant_foot: foot as Profile['dominant_foot'] })}
      onLayoutY={onLayoutY}
    >
      <Text className="text-xs font-semibold text-gray-500 mb-2">Posição</Text>
      <View className="flex-row gap-2">
        {POSITION_OPTIONS.map(p => (
          <OptionButton key={p.value} selected={position === p.value} onPress={() => setPosition(p.value)} className="items-center gap-1 p-3">
            <Text className="text-2xl">{p.emoji}</Text>
            <Text className="text-xs font-semibold text-gray-700 text-center">{p.label}</Text>
          </OptionButton>
        ))}
      </View>
      <Text className="text-xs font-semibold text-gray-500 mt-4 mb-2">Pé dominante</Text>
      <View className="flex-row gap-2">
        {FOOT_OPTIONS.map(f => (
          <OptionButton key={f.value} selected={foot === f.value} onPress={() => setFoot(f.value)} className="items-center gap-1 p-3">
            <Text className="text-xl">{f.emoji}</Text>
            <Text className="text-xs font-semibold text-gray-700">{f.label}</Text>
          </OptionButton>
        ))}
      </View>
    </Section>
  );
}

function AvailabilitySection({ profile, save, highlight, onLayoutY }: SectionProps) {
  const savedDays = profile.availability?.days ?? [];
  const savedPeriods = profile.availability?.periods ?? [];
  const [days, setDays] = useState<string[]>(savedDays);
  const [periods, setPeriods] = useState<string[]>(savedPeriods);

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);
  const same = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x));
  const dirty = !same(days, savedDays) || !same(periods, savedPeriods);

  return (
    <Section
      title="Quando você joga"
      hint="Ajuda a te conectar com jogadores da mesma agenda"
      highlight={highlight}
      dirty={dirty}
      onSave={() => save({ availability: days.length || periods.length ? { days, periods } : null })}
      onLayoutY={onLayoutY}
    >
      <Text className="text-xs font-semibold text-gray-500 mb-2">Dias da semana</Text>
      <View className="flex-row flex-wrap gap-1.5">
        {DAY_OPTIONS.map(d => {
          const on = days.includes(d.value);
          return (
            <Pressable
              key={d.value}
              onPress={() => setDays(prev => toggle(prev, d.value))}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              className={`px-3 py-2 rounded-xl border-2 ${on ? 'bg-violet-600 border-violet-600' : 'border-gray-200'}`}
            >
              <Text className={`text-sm font-semibold ${on ? 'text-white' : 'text-gray-600'}`}>{d.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text className="text-xs font-semibold text-gray-500 mt-4 mb-2">Horário preferido</Text>
      <View className="flex-row gap-2">
        {PERIOD_OPTIONS.map(p => (
          <OptionButton key={p.value} selected={periods.includes(p.value)} onPress={() => setPeriods(prev => toggle(prev, p.value))} className="py-3 px-2 items-center">
            <Text className="text-sm font-semibold text-gray-900">{p.label}</Text>
            <Text className="text-[11px] text-gray-400">{p.sub}</Text>
          </OptionButton>
        ))}
      </View>
    </Section>
  );
}

function BioSection({ profile, save, highlight, onLayoutY }: SectionProps) {
  const [bio, setBio] = useState(profile.bio ?? '');
  return (
    <Section
      title="Sobre você"
      hint="Opcional — aparece no seu perfil público"
      highlight={highlight}
      dirty={bio.trim() !== (profile.bio ?? '')}
      onSave={() => save({ bio: bio.trim() || null })}
      onLayoutY={onLayoutY}
    >
      <TextInput
        value={bio}
        onChangeText={t => setBio(t.slice(0, BIO_MAX))}
        multiline
        numberOfLines={3}
        placeholder="Ex: Jogo futevôlei há 3 anos, procuro dupla pra jogar à noite."
        placeholderTextColor={palette.gray['400']}
        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm text-gray-900"
        style={[inputStyle, { minHeight: 84, textAlignVertical: 'top' }]}
      />
      <Text className="text-right text-[11px] text-gray-400">
        {bio.length}/{BIO_MAX}
      </Text>
    </Section>
  );
}
