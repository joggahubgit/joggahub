import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Web pattern: black/50 backdrop, white rounded-t-3xl panel with a grab bar. */
export function BottomSheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      {/* Lifts the panel above the keyboard (e.g. the add-player search on iOS). */}
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable className="flex-1 bg-black/50 justify-end" onPress={onClose} accessibilityLabel="Fechar">
          <Pressable
            onPress={() => {}}
            className="bg-white rounded-t-3xl p-6 w-full"
            style={{ paddingBottom: 24 + insets.bottom, maxHeight: '90%' }}
          >
            <View className="w-10 h-1 bg-gray-300 rounded-full self-center mb-5" />
            {children}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
