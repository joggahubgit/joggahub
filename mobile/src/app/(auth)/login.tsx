import { useRef, useState } from 'react';
import { StyleSheet, Text, View, type TextInputInstance } from 'react-native';
import { Link } from 'expo-router';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import { authErrorMessage } from '@/features/auth/authErrors';
import { colors, fonts, spacing, type } from '@/theme/tokens';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<TextInputInstance>(null);

  async function handleSubmit() {
    if (loading) return;
    if (!email.trim() || !password) {
      setError('Preencha email e senha.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
      // Navigation happens automatically: the root guard switches to (tabs).
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Text style={styles.brand} accessibilityRole="header">JoggaHub</Text>
        <Text style={type.caption}>Onde a comunidade joga</Text>
      </View>

      <TextField
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
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={handleSubmit}
      />

      {!!error && (
        <Text style={styles.error} accessibilityLiveRegion="assertive">
          {error}
        </Text>
      )}

      <Button title="Entrar" onPress={handleSubmit} loading={loading} />

      <View style={styles.footer}>
        <Text style={type.caption}>Ainda não tem conta? </Text>
        <Link href="/signup" style={styles.link}>
          Criar conta
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', marginTop: spacing.xxl * 1.5, marginBottom: spacing.xl, gap: spacing.xs },
  brand: { fontFamily: fonts.extrabold, fontSize: 34, color: colors.primary },
  error: { fontFamily: fonts.medium, fontSize: 14, color: colors.danger, textAlign: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', minHeight: 48 },
  link: { fontFamily: fonts.semibold, fontSize: 14, color: colors.primary, padding: spacing.sm },
});
