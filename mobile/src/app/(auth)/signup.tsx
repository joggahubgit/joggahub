import { useRef, useState } from 'react';
import { StyleSheet, Text, View, type TextInputInstance } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import { authErrorMessage } from '@/features/auth/authErrors';
import { colors, fonts, radius, spacing, type } from '@/theme/tokens';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignupScreen() {
  const { signUp } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const emailRef = useRef<TextInputInstance>(null);
  const passwordRef = useRef<TextInputInstance>(null);

  async function handleSubmit() {
    if (loading) return;
    if (!name.trim()) return setError('Informe seu nome.');
    if (!EMAIL_RE.test(email.trim())) return setError('Informe um email válido.');
    if (password.length < 6) return setError('A senha precisa ter pelo menos 6 caracteres.');
    setError(null);
    setLoading(true);
    try {
      const { needsConfirmation } = await signUp(email, password, name);
      if (needsConfirmation) setSentTo(email.trim());
      // Otherwise a session exists and the root guard switches to (tabs).
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  if (sentTo) {
    return (
      <Screen>
        <View style={styles.notice}>
          <Text style={type.title} accessibilityRole="header">Confirme seu email</Text>
          <Text style={type.body}>
            Enviamos um link de confirmação para <Text style={styles.bold}>{sentTo}</Text>. Abra o link e depois
            volte aqui para entrar.
          </Text>
        </View>
        <Button title="Ir para o login" onPress={() => router.replace('/login')} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Text style={[type.title, styles.title]} accessibilityRole="header">Criar conta</Text>

      <TextField
        label="Nome"
        value={name}
        onChangeText={setName}
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
        onSubmitEditing={() => emailRef.current?.focus()}
      />
      <TextField
        ref={emailRef}
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <TextField
        ref={passwordRef}
        label="Senha"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={handleSubmit}
      />

      {!!error && (
        <Text style={styles.error} accessibilityLiveRegion="assertive">
          {error}
        </Text>
      )}

      <Button title="Criar conta" onPress={handleSubmit} loading={loading} />
      <Button title="Já tenho conta" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: spacing.xl },
  notice: { gap: spacing.md, backgroundColor: colors.primarySoft, borderRadius: radius.xl, padding: spacing.xl, marginTop: spacing.xxl },
  bold: { fontFamily: fonts.semibold },
  error: { fontFamily: fonts.medium, fontSize: 14, color: colors.danger, textAlign: 'center' },
});
