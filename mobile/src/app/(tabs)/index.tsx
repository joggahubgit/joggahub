import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/features/auth/AuthProvider';
import { colors, radius, spacing, type } from '@/theme/tokens';

export default function HomeScreen() {
  const { profile } = useAuth();
  const firstName = profile?.name?.split(' ')[0];

  return (
    <Screen edges={['top']}>
      <Text style={type.title} accessibilityRole="header">
        {firstName ? `Olá, ${firstName}` : 'Olá'}
      </Text>
      {/* Phase 2 foundation: upcoming games, courts and open games arrive in Phase 3. */}
      <View style={styles.card}>
        <Text style={type.heading}>Fundação do app</Text>
        <Text style={type.caption}>
          Login, sessão segura e navegação estão prontos. Reservas e partidas entram na próxima fase.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.sm,
  },
});
