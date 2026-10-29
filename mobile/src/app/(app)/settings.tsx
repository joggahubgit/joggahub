// Port of src/app/components/SettingsPage.tsx (web).
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { AlertTriangle, Check, ChevronRight } from 'lucide-react-native';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Text } from '@/components/ui/Text';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import palette from '../../../tailwind.palette';

export default function Settings() {
  const { session, signOut } = useAuth();
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

  // Account deletion (App Store / Google Play): the server refuses while games,
  // bookings or plans are still active and tells the user what to close first.
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<{ message: string; blockers: string[] } | null>(null);

  async function deleteAccount() {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    const { data, error: fnErr } = await supabase.functions.invoke('delete-account', { body: { confirm: true } });
    if (fnErr || !data?.deleted) {
      const body = await (fnErr as { context?: Response } | null)?.context?.json?.().catch(() => null);
      setDeleteError({ message: body?.error ?? data?.error ?? 'Não foi possível excluir a conta. Tente novamente.', blockers: body?.blockers ?? [] });
      setDeleting(false);
      return;
    }
    setShowDelete(false);
    await signOut().catch(() => {});
    router.replace('/welcome');
  }

  const closeDelete = () => {
    if (deleting) return;
    setShowDelete(false);
    setDeleteError(null);
  };

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
          <Pressable
            onPress={() => setShowDelete(true)}
            accessibilityRole="button"
            className="w-full p-4 flex-row items-center justify-between active:bg-gray-50"
          >
            <Text className="font-semibold text-red-600 text-base">Excluir conta</Text>
            <ChevronRight size={20} color={palette.gray['400']} />
          </Pressable>
        </View>
      </ScrollView>

      <BottomSheet visible={showDelete} onClose={closeDelete}>
        <View className="items-center mb-4">
          <View className="w-14 h-14 bg-red-50 rounded-full items-center justify-center mb-3">
            <AlertTriangle size={28} color={palette.red['600']} />
          </View>
          <Text className="font-bold text-gray-900 text-xl">Excluir conta?</Text>
        </View>
        {deleteError ? (
          <View className="bg-red-50 border border-red-100 rounded-2xl p-4 mb-5 gap-2">
            <Text className="text-sm font-semibold text-red-600">{deleteError.message}</Text>
            {deleteError.blockers.map(b => (
              <Text key={b} className="text-sm text-red-600">• {b}</Text>
            ))}
          </View>
        ) : (
          <View className="gap-2 mb-5">
            <Text className="text-sm text-gray-600 leading-relaxed">
              Seus dados pessoais (nome, telefone, foto e perfil) serão apagados e você não poderá mais entrar com esta conta.
            </Text>
            <Text className="text-sm text-gray-600 leading-relaxed">
              Partidas já jogadas continuam no histórico dos outros jogadores como “Usuário removido”. Esta ação não pode ser desfeita.
            </Text>
          </View>
        )}
        <View className="gap-3">
          {!deleteError?.blockers.length && (
            <Pressable
              onPress={deleteAccount}
              disabled={deleting}
              accessibilityRole="button"
              className={`w-full bg-red-600 py-4 rounded-2xl flex-row items-center justify-center gap-2 active:bg-red-700 ${deleting ? 'opacity-60' : ''}`}
            >
              {deleting && <ActivityIndicator color="#ffffff" />}
              <Text className="text-white font-bold text-base">{deleting ? 'Excluindo...' : 'Excluir minha conta'}</Text>
            </Pressable>
          )}
          <Pressable onPress={closeDelete} disabled={deleting} accessibilityRole="button" className="w-full py-3 items-center">
            <Text className="text-sm text-gray-500 font-semibold">{deleteError?.blockers.length ? 'Entendi' : 'Cancelar'}</Text>
          </Pressable>
        </View>
      </BottomSheet>
    </View>
  );
}
