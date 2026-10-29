// Port of src/app/components/SettingsPage.tsx (web).
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Check, ChevronRight } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import palette from '../../../tailwind.palette';

const DELETE_MAILTO = 'mailto:info@joggahub.com?subject=Solicita%C3%A7%C3%A3o%20de%20exclus%C3%A3o%20de%20conta';

export default function Settings() {
  const { session } = useAuth();
  const isPasswordAccount = session?.user.app_metadata?.provider === 'email';

  const [open, setOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function changePassword() {
    if (saving) return;
    setError(null);
    setSuccess(false);
    if (newPassword.length < 6) return setError('A senha precisa ter pelo menos 6 caracteres.');
    if (newPassword !== confirmPassword) return setError('As senhas não coincidem.');
    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);
    if (updateError) return setError(updateError.message);
    setSuccess(true);
    setNewPassword('');
    setConfirmPassword('');
    setTimeout(() => {
      setOpen(false);
      setSuccess(false);
    }, 1500);
  }

  const inputClass = 'w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-base text-gray-900';

  return (
    <View className="flex-1 bg-gray-50">
      <PageHeader title="Configurações" />
      <ScrollView contentContainerClassName="px-6 py-6 gap-6" keyboardShouldPersistTaps="handled">
        <View className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {isPasswordAccount && (
            <View className="border-b border-gray-100">
              <Pressable
                onPress={() => setOpen(v => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                className="w-full p-4 flex-row items-center justify-between active:bg-gray-50"
              >
                <Text className="font-semibold text-gray-900 text-base">Alterar senha</Text>
                <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
                  <ChevronRight size={20} color={palette.gray['400']} />
                </View>
              </Pressable>
              {open && (
                <View className="px-4 pb-4 gap-3">
                  <TextInput
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="Nova senha"
                    placeholderTextColor={palette.gray['400']}
                    secureTextEntry
                    autoComplete="new-password"
                    textContentType="newPassword"
                    className={inputClass}
                    style={{ fontFamily: 'Inter_400Regular' }}
                  />
                  <TextInput
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Confirmar nova senha"
                    placeholderTextColor={palette.gray['400']}
                    secureTextEntry
                    autoComplete="new-password"
                    textContentType="newPassword"
                    className={inputClass}
                    style={{ fontFamily: 'Inter_400Regular' }}
                    returnKeyType="done"
                    onSubmitEditing={changePassword}
                  />
                  {!!error && <Text className="text-sm text-red-600">{error}</Text>}
                  {success && (
                    <View className="flex-row items-center gap-1">
                      <Check size={16} color={palette.green['600']} />
                      <Text className="text-sm text-green-600">Senha atualizada</Text>
                    </View>
                  )}
                  <Pressable
                    onPress={changePassword}
                    disabled={saving}
                    accessibilityRole="button"
                    className={`w-full bg-violet-600 py-2.5 rounded-xl flex-row items-center justify-center gap-2 active:bg-violet-700 ${saving ? 'opacity-60' : ''}`}
                  >
                    {saving && <ActivityIndicator size="small" color="#ffffff" />}
                    <Text className="text-white font-semibold text-base">Salvar nova senha</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
          {/* Same as the web for now; store rules require in-app deletion before release (see AUDIT §5). */}
          <Pressable
            onPress={() => Linking.openURL(DELETE_MAILTO)}
            accessibilityRole="link"
            className="w-full p-4 flex-row items-center justify-between active:bg-gray-50"
          >
            <Text className="font-semibold text-red-600 text-base">Excluir conta</Text>
            <ChevronRight size={20} color={palette.gray['400']} />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
