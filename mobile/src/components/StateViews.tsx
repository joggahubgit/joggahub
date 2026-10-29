import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Button } from './Button';
import { colors, spacing, type } from '@/theme/tokens';

export function LoadingView({ label = 'Carregando…' }: { label?: string }) {
  return (
    <View style={styles.center} accessibilityLabel={label} accessibilityRole="progressbar">
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}

export function EmptyView({ emoji, title, message }: { emoji?: string; title: string; message?: string }) {
  return (
    <View style={styles.center}>
      {!!emoji && <Text style={styles.emoji}>{emoji}</Text>}
      <Text style={[type.heading, styles.text]}>{title}</Text>
      {!!message && <Text style={[type.caption, styles.text]}>{message}</Text>}
    </View>
  );
}

export function ErrorView({ onRetry, message }: { onRetry?: () => void; message?: string }) {
  return (
    <View style={styles.center}>
      <Text style={[type.heading, styles.text]}>Não foi possível carregar</Text>
      <Text style={[type.caption, styles.text]}>{message ?? 'Verifique sua conexão e tente de novo.'}</Text>
      {onRetry && <Button title="Tentar de novo" variant="secondary" onPress={onRetry} style={styles.retry} />}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm, minHeight: 200 },
  emoji: { fontSize: 40 },
  text: { textAlign: 'center' },
  retry: { marginTop: spacing.md, alignSelf: 'stretch' },
});
