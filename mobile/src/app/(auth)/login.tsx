// Port of src/app/components/Auth.tsx (web), email form stage.
// Deviation: the web's first stage also lists Google and Apple. Apple has no
// action on the web, and neither provider is configured for the app yet, so the
// app opens straight on the email form. Add both once configured (App Store 4.8).
import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View, type TextInputInstance } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, CheckCircle, Mail } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/features/auth/AuthProvider';
import { authErrorMessage } from '@/features/auth/authErrors';
import { supabase } from '@/lib/supabase';
import { getEnv } from '@/lib/env';
import palette from '../../../tailwind.palette';

function Field(props: React.ComponentProps<typeof TextInput> & { label: string; inputRef?: React.Ref<TextInputInstance> }) {
  const { label, inputRef, ...rest } = props;
  const [focused, setFocused] = useState(false);
  return (
    <View>
      <Text className="text-sm font-medium text-gray-700 mb-2">{label}</Text>
      <TextInput
        ref={inputRef}
        accessibilityLabel={label}
        placeholderTextColor={palette.gray['400']}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={`w-full px-4 py-3 border-2 rounded-xl text-base text-gray-900 ${focused ? 'border-violet-600' : 'border-gray-200'}`}
        style={{ fontFamily: 'Inter_400Regular' }}
        {...rest}
      />
    </View>
  );
}

export default function Login() {
  const { signIn, signUp } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
  const [resent, setResent] = useState(false);
  const emailRef = useRef<TextInputInstance>(null);
  const passwordRef = useRef<TextInputInstance>(null);

  async function submit() {
    if (loading) return;
    // Same constraints as the web form's `required` / `minLength={6}`.
    if ((isSignUp && !form.name.trim()) || !form.email.trim() || form.password.length < 6) {
      setError(form.password && form.password.length < 6 ? 'A senha precisa ter pelo menos 6 caracteres.' : 'Preencha todos os campos.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      if (isSignUp) {
        const { needsConfirmation } = await signUp(form.email, form.password, form.name);
        if (needsConfirmation) setPendingConfirmation(true);
      } else {
        await signIn(form.email, form.password);
      }
      // On success the root guard switches to the signed-in app.
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setResent(false);
    await supabase.auth.resend({
      type: 'signup',
      email: form.email.trim(),
      options: { emailRedirectTo: `${getEnv().webUrl}/auth/callback` },
    });
    setResent(true);
  }

  if (pendingConfirmation) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-1 bg-white items-center justify-center px-6 py-12">
          <View className="w-20 h-20 bg-violet-100 rounded-full items-center justify-center mb-6">
            <Mail size={40} color={palette.violet['600']} />
          </View>
          <Text className="text-2xl font-bold text-gray-900 text-center mb-2">Verifique seu email</Text>
          <Text className="text-base text-gray-500 text-center mb-1">Enviamos um link de confirmação para</Text>
          <Text className="text-base font-semibold text-gray-900 text-center mb-6">{form.email}</Text>
          <Text className="text-gray-500 text-sm text-center mb-8">
            Clique no link do email para ativar sua conta e começar a jogar. Se não encontrar, verifique a pasta de spam.
          </Text>
          {resent ? (
            <View className="flex-row items-center gap-2 mb-6">
              <CheckCircle size={16} color={palette.green['600']} />
              <Text className="text-green-600 text-sm">Email reenviado!</Text>
            </View>
          ) : (
            <Pressable onPress={resend} hitSlop={10} className="mb-6">
              <Text className="text-violet-600 font-semibold text-sm">Reenviar email</Text>
            </Pressable>
          )}
          <Pressable
            hitSlop={10}
            onPress={() => {
              setPendingConfirmation(false);
              setIsSignUp(false);
              setResent(false);
            }}
          >
            <Text className="text-gray-500 text-sm">Voltar para o login</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View className="flex-1 bg-white">
      <SafeAreaView edges={['top']} className="bg-violet-600">
        <View className="bg-violet-600 px-6 py-4">
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/welcome'))}
            className="flex-row items-center gap-2 self-start"
            accessibilityRole="button"
            hitSlop={10}
          >
            <ArrowLeft size={20} color="#ffffff" />
            <Text className="text-white text-base font-medium">Voltar</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="px-6 py-8">
          <View className="items-center mb-8">
            <View className="bg-violet-100 rounded-full p-4 mb-4">
              <Image source={require('../../../assets/logo.png')} style={{ width: 40, height: 40 }} contentFit="contain" />
            </View>
            <Text className="text-2xl font-bold text-gray-900">Bem-vindo ao JoggaHub</Text>
            <Text className="text-base text-gray-600 mt-2">Entre ou crie sua conta</Text>
          </View>

          <View className="gap-4">
            {/* Web uses mb-4 inside space-y-4 (margins collapse to 16px); here gap-4 already gives 16px. */}
            <View className="flex-row bg-gray-100 rounded-xl p-1">
              {[false, true].map(signUpTab => {
                const active = isSignUp === signUpTab;
                return (
                  <Pressable
                    key={String(signUpTab)}
                    onPress={() => setIsSignUp(signUpTab)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    className={`flex-1 py-2 rounded-lg items-center ${active ? 'bg-white shadow' : ''}`}
                  >
                    <Text className={`font-semibold text-base ${active ? 'text-gray-900' : 'text-gray-500'}`}>
                      {signUpTab ? 'Cadastrar' : 'Entrar'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {isSignUp && (
              <Field
                label="Nome completo"
                value={form.name}
                onChangeText={name => setForm(f => ({ ...f, name }))}
                placeholder="João Silva"
                autoComplete="name"
                textContentType="name"
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
              />
            )}
            <Field
              label="Email"
              inputRef={emailRef}
              value={form.email}
              onChangeText={email => setForm(f => ({ ...f, email }))}
              placeholder="seu@email.com"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
            <Field
              label="Senha"
              inputRef={passwordRef}
              value={form.password}
              onChangeText={password => setForm(f => ({ ...f, password }))}
              placeholder="••••••••"
              secureTextEntry
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              textContentType={isSignUp ? 'newPassword' : 'password'}
              returnKeyType="go"
              onSubmitEditing={submit}
            />

            {!!error && (
              <View className="bg-red-50 border border-red-200 rounded-xl px-4 py-3" accessibilityLiveRegion="assertive">
                <Text className="text-sm text-red-700">{error}</Text>
              </View>
            )}

            <Pressable
              onPress={submit}
              disabled={loading}
              accessibilityRole="button"
              accessibilityState={{ disabled: loading, busy: loading }}
              className={`w-full bg-violet-600 py-4 rounded-xl flex-row items-center justify-center gap-2 active:bg-violet-700 ${loading ? 'opacity-60' : ''}`}
            >
              {loading && <ActivityIndicator color="#ffffff" />}
              <Text className="text-white font-semibold text-base">{isSignUp ? 'Criar conta' : 'Entrar'}</Text>
            </Pressable>

            <View className="items-center mt-6">
              <Text className="text-center text-sm text-gray-500">Ao continuar, você concorda com nossos</Text>
              <Text className="text-center text-sm text-gray-500">
                <Text className="text-sm text-violet-600 underline" onPress={() => router.push('/terms')}>
                  Termos de Uso
                </Text>{' '}
                e{' '}
                <Text className="text-sm text-violet-600 underline" onPress={() => router.push('/privacy')}>
                  Política de Privacidade
                </Text>
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
