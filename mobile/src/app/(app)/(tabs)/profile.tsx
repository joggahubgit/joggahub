import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import { confirmAction } from '@/lib/confirm';
import { colors, fonts, radius, spacing, type } from '@/theme/tokens';

export default function ProfileScreen() {
  const { session, profile, signOut } = useAuth();
  const [loading, setLoading] = useState(false);

  function confirmSignOut() {
    confirmAction({
      title: 'Sair da conta?',
      message: 'Você precisará entrar de novo neste aparelho.',
      confirmText: 'Sair',
      destructive: true,
      onConfirm: async () => {
        setLoading(true);
        try {
          await signOut();
        } catch {
          setLoading(false);
          Alert.alert('Não foi possível sair', 'Tente novamente.');
        }
      },
    });
  }

  const name = profile?.name ?? 'Jogador';
  return (
    <Screen edges={['top']}>
      <View style={styles.header}>
        <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no">
          <Text style={styles.initial}>{name.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={type.title}>{name}</Text>
        <Text style={type.caption}>{session?.user.email}</Text>
      </View>
      <View style={styles.spacer} />
      <Button title="Sair" variant="danger" onPress={confirmSignOut} loading={loading} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: radius.full,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { fontFamily: fonts.bold, fontSize: 34, color: colors.primary },
  spacer: { flex: 1 },
});
