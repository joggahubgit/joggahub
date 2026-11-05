// Port of src/app/components/Onboarding.tsx (web).
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Camera, Check, ChevronRight, Zap } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/features/auth/AuthProvider';
import { declareInitialRating, fetchFutevoleiRating, pickAvatar, updateProfile, uploadAvatar, type PickedImage } from '@/features/profile/api';
import { CityInput } from '@/features/profile/CityInput';
import { supabase } from '@/lib/supabase';
import { DAY_OPTIONS as DAYS, FOOT_OPTIONS, FUTEVOLEI_LEVELS, PERIOD_OPTIONS as PERIODS, POSITION_OPTIONS as POSITIONS } from '@/lib/shared';
import palette from '../../../tailwind.palette';

const inputStyle = { fontFamily: 'Inter_400Regular' };

function CheckDot({ size = 20 }: { size?: number }) {
  return (
    <View className="bg-violet-600 rounded-full items-center justify-center" style={{ width: size, height: size }}>
      <Check size={size * 0.6} color="#ffffff" />
    </View>
  );
}

export default function Onboarding() {
  const { session, profile, refreshProfile } = useAuth();
  const userId = session!.user.id;
  // The futevôlei level step only exists for players without a rating yet.
  const ratingQ = useQuery({ queryKey: ['futevoleiRating', userId], queryFn: () => fetchFutevoleiRating(userId) });
  const hasRating = !!ratingQ.data;
  const TOTAL = hasRating ? 3 : 4;

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [cityValid, setCityValid] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [image, setImage] = useState<PickedImage | null>(null);
  const [name, setName] = useState(profile?.name ?? '');
  const [city, setCity] = useState(profile?.location ?? '');
  const [position, setPosition] = useState(profile?.preferred_position ?? '');
  const [foot, setFoot] = useState<string>(profile?.dominant_foot ?? '');
  const [days, setDays] = useState<string[]>(profile?.availability?.days ?? []);
  const [periods, setPeriods] = useState<string[]>(profile?.availability?.periods ?? []);
  const [level, setLevel] = useState('');
  const avatarPreview = image?.uri ?? profile?.avatar_url ?? null;

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);
  const canAdvance = step === 1 ? !!name.trim() && cityValid : step === 2 ? !!position && !!foot : true;

  async function finish() {
    setSaving(true);
    setSaveError('');
    try {
      let avatar_url = profile?.avatar_url ?? null;
      if (image) {
        try {
          avatar_url = await uploadAvatar(userId, image);
        } catch {
          // Same as the web: a failed photo upload doesn't block saving the rest.
        }
      }
      const isFirstTime = !profile?.preferred_position;
      // update (not upsert): the row always exists and profiles has no INSERT policy.
      await updateProfile(userId, {
        name: name.trim(),
        location: city.trim(),
        avatar_url,
        preferred_position: position,
        dominant_foot: foot || null,
        availability: days.length || periods.length ? { days, periods } : null,
        onboarding_completed: true,
      });
      if (isFirstTime) await supabase.rpc('increment_xp', { user_id: userId, amount: 20 });
      if (level && !hasRating) {
        const l = FUTEVOLEI_LEVELS.find(x => x.key === level);
        // Profile is already saved — a failed level isn't worth blocking on.
        if (l) await declareInitialRating(l.rating).catch(() => {});
      }
      await refreshProfile();
      router.replace({ pathname: '/', params: isFirstTime ? { firstLogin: '1' } : {} });
    } catch {
      setSaveError('Não foi possível salvar seu perfil. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  const next = () => (step < TOTAL ? setStep(s => s + 1) : finish());

  return (
    <View className="flex-1 bg-white">
      <SafeAreaView edges={['top']} className="bg-violet-600">
        <View className="bg-violet-600 px-6 pt-6 pb-6">
          <Text className="text-sm font-medium text-violet-200 mb-3">
            Passo {step} de {TOTAL}
          </Text>
          <View className="flex-row gap-1.5">
            {Array.from({ length: TOTAL }).map((_, i) => (
              <View key={i} className={`h-1.5 flex-1 rounded-full ${i < step ? 'bg-white' : 'bg-violet-400'}`} />
            ))}
          </View>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="flex-grow px-6 py-8" keyboardShouldPersistTaps="handled">
          {step === 1 && (
            <View className="gap-6 flex-1">
              <View>
                <Text className="text-2xl font-bold text-gray-900">Vamos montar seu perfil</Text>
                <Text className="text-base text-gray-500 mt-1">Seus companheiros de jogo vão te ver assim</Text>
              </View>
              <View className="items-center gap-3">
                <Pressable
                  onPress={async () => {
                    const p = await pickAvatar();
                    if (p) setImage(p);
                  }}
                  accessibilityLabel="Escolher foto"
                  className="w-24 h-24 rounded-full bg-violet-100 items-center justify-center overflow-hidden border-4 border-white shadow-lg"
                >
                  {avatarPreview ? (
                    <Image source={{ uri: avatarPreview }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  ) : (
                    <Text className="text-3xl font-bold text-violet-400">{name.charAt(0).toUpperCase() || '?'}</Text>
                  )}
                  <View className="absolute bottom-0 left-0 right-0 bg-black/30 items-center py-1">
                    <Camera size={16} color="#ffffff" />
                  </View>
                </Pressable>
                <Pressable
                  onPress={async () => {
                    const p = await pickAvatar();
                    if (p) setImage(p);
                  }}
                  hitSlop={8}
                >
                  <Text className="text-sm text-violet-600 font-semibold">{avatarPreview ? 'Trocar foto' : 'Adicionar foto'}</Text>
                </Pressable>
              </View>
              <View>
                <Text className="text-sm font-semibold text-gray-700 mb-2">Nome</Text>
                <TextInput value={name} onChangeText={setName} placeholder="João Silva" placeholderTextColor={palette.gray['400']} autoComplete="name" className="w-full px-4 py-3.5 border-2 border-gray-200 rounded-xl text-base text-gray-900" style={inputStyle} />
              </View>
              <View>
                <Text className="text-sm font-semibold text-gray-700 mb-2">Cidade</Text>
                <CityInput value={city} onChange={setCity} onValidChange={setCityValid} paddingClassName="py-3.5" />
              </View>
            </View>
          )}

          {step === 2 && (
            <View className="gap-6 flex-1">
              <View>
                <Text className="text-2xl font-bold text-gray-900">Como você joga?</Text>
                <Text className="text-base text-gray-500 mt-1">Essas informações aparecem no seu perfil</Text>
              </View>
              <View>
                <Text className="text-sm font-semibold text-gray-700 mb-3">Sua posição</Text>
                <View className="flex-row gap-2">
                  {POSITIONS.map(p => {
                    const on = position === p.value;
                    return (
                      <Pressable key={p.value} onPress={() => setPosition(p.value)} accessibilityState={{ selected: on }} className={`flex-1 items-center gap-1 p-3 rounded-xl border-2 ${on ? 'border-violet-600 bg-violet-50' : 'border-gray-200'}`}>
                        <Text className="text-2xl">{p.emoji}</Text>
                        <Text className="text-xs font-semibold text-gray-700 text-center">{p.label}</Text>
                        {on && (
                          <View className="absolute top-1.5 right-1.5">
                            <CheckDot size={16} />
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <View>
                <Text className="text-sm font-semibold text-gray-700 mb-3">Pé dominante</Text>
                <View className="flex-row gap-2">
                  {FOOT_OPTIONS.map(f => {
                    const on = foot === f.value;
                    return (
                      <Pressable key={f.value} onPress={() => setFoot(f.value)} accessibilityState={{ selected: on }} className={`flex-1 items-center gap-1 py-3 px-2 rounded-xl border-2 ${on ? 'border-violet-600 bg-violet-50' : 'border-gray-200'}`}>
                        <Text className="text-xl">{f.emoji}</Text>
                        <Text className="text-xs font-semibold text-gray-700">{f.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>
          )}

          {step === 3 && (
            <View className="gap-6 flex-1">
              <View>
                <Text className="text-2xl font-bold text-gray-900">Quando você joga?</Text>
                <Text className="text-base text-gray-500 mt-1">Vamos te conectar com jogadores com a mesma agenda</Text>
              </View>
              <View>
                <Text className="text-sm font-semibold text-gray-700 mb-3">Dias da semana</Text>
                <View className="flex-row gap-1.5 flex-wrap">
                  {DAYS.map(d => {
                    const on = days.includes(d.value);
                    return (
                      <Pressable key={d.value} onPress={() => setDays(prev => toggle(prev, d.value))} accessibilityRole="checkbox" accessibilityState={{ checked: on }} className={`px-3 py-2 rounded-xl border-2 ${on ? 'bg-violet-600 border-violet-600' : 'border-gray-200'}`}>
                        <Text className={`text-sm font-semibold ${on ? 'text-white' : 'text-gray-600'}`}>{d.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <View>
                <Text className="text-sm font-semibold text-gray-700 mb-3">Horário preferido</Text>
                <View className="gap-2">
                  {PERIODS.map(p => {
                    const on = periods.includes(p.value);
                    return (
                      <Pressable key={p.value} onPress={() => setPeriods(prev => toggle(prev, p.value))} accessibilityRole="checkbox" accessibilityState={{ checked: on }} className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl border-2 ${on ? 'border-violet-600 bg-violet-50' : 'border-gray-200'}`}>
                        <View>
                          <Text className="font-semibold text-gray-900 text-base">{p.label}</Text>
                          <Text className="text-xs text-gray-400">{p.sub}</Text>
                        </View>
                        {on && <CheckDot />}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <View className="flex-row items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mt-auto">
                <Zap size={20} color={palette.amber['500']} />
                <Text className="text-sm text-amber-800 flex-1">
                  <Text className="text-sm font-bold text-amber-800">+20 XP</Text> por completar seu perfil — você começa na frente!
                </Text>
              </View>
            </View>
          )}

          {step === 4 && (
            <View className="gap-6 flex-1">
              <View>
                <Text className="text-2xl font-bold text-gray-900">Qual seu nível no futevôlei?</Text>
                <Text className="text-base text-gray-500 mt-1">
                  Só pra começar sua pontuação num lugar razoável — ela se ajusta sozinha conforme você for jogando. Pode pular se não joga futevôlei.
                </Text>
              </View>
              <View className="gap-2">
                {FUTEVOLEI_LEVELS.map(l => {
                  const on = level === l.key;
                  return (
                    <Pressable key={l.key} onPress={() => setLevel(prev => (prev === l.key ? '' : l.key))} accessibilityState={{ selected: on }} className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl border-2 ${on ? 'border-violet-600 bg-violet-50' : 'border-gray-200'}`}>
                      <View className="flex-1">
                        <Text className="font-semibold text-gray-900 text-base">{l.label}</Text>
                        <Text className="text-xs text-gray-400">{l.description}</Text>
                      </View>
                      {on && <CheckDot />}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {!!saveError && (
            <View className="mt-8 -mb-4 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              <Text className="text-sm text-red-600">{saveError}</Text>
            </View>
          )}

          <Pressable
            onPress={next}
            disabled={saving || !canAdvance}
            accessibilityRole="button"
            className={`w-full py-4 rounded-xl mt-8 flex-row items-center justify-center gap-2 ${saving || !canAdvance ? 'bg-gray-200' : 'bg-violet-600 active:bg-violet-700'}`}
          >
            {saving ? (
              <>
                <ActivityIndicator color={palette.gray['400']} />
                <Text className="font-bold text-base text-gray-400">Salvando...</Text>
              </>
            ) : step === TOTAL ? (
              <>
                <Zap size={20} color={!canAdvance ? palette.gray['400'] : '#ffffff'} />
                <Text className={`font-bold text-base ${!canAdvance ? 'text-gray-400' : 'text-white'}`}>Finalizar e ganhar 20 XP</Text>
              </>
            ) : (
              <>
                <Text className={`font-bold text-base ${!canAdvance ? 'text-gray-400' : 'text-white'}`}>Continuar</Text>
                <ChevronRight size={20} color={!canAdvance ? palette.gray['400'] : '#ffffff'} />
              </>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
