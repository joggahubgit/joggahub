import type { ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Web pattern: black/50 backdrop, white rounded-t-3xl panel with a grab bar. */
export function BottomSheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable className="flex-1 bg-black/50 justify-end" onPress={onClose} accessibilityLabel="Fechar">
        <Pressable onPress={() => {}} className="bg-white rounded-t-3xl p-6 w-full" style={{ paddingBottom: 24 + insets.bottom }}>
          <View className="w-10 h-1 bg-gray-300 rounded-full self-center mb-5" />
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
