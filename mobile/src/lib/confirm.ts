import { Alert, Platform } from 'react-native';

/**
 * Two-button confirmation. Alert.alert ignores buttons on web (browser preview),
 * so fall back to window.confirm there.
 */
export function confirmAction(opts: { title: string; message: string; confirmText: string; destructive?: boolean; onConfirm: () => void }) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${opts.title}\n\n${opts.message}`)) opts.onConfirm();
    return;
  }
  Alert.alert(opts.title, opts.message, [
    { text: 'Cancelar', style: 'cancel' },
    { text: opts.confirmText, style: opts.destructive ? 'destructive' : 'default', onPress: opts.onConfirm },
  ]);
}
