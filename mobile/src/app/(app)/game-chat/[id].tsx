// Port of src/app/components/GameChat.tsx (web): group chat scoped to a game's roster.
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Send } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/features/auth/AuthProvider';
import { fetchChat, sendMessage, type ChatData, type ChatMessage } from '@/features/chat/api';
import { supabase } from '@/lib/supabase';
import palette from '../../../../tailwind.palette';

const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export default function GameChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const userId = session!.user.id;
  const qc = useQueryClient();
  const key = ['chat', id];
  const q = useQuery({ queryKey: key, queryFn: () => fetchChat(id), enabled: !!id, staleTime: Infinity });
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<FlatList<ChatMessage>>(null);

  // Realtime: append new messages for this game (dedup by id).
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`game-chat-${id}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_messages', filter: `game_id=eq.${id}` }, payload => {
        const msg = payload.new as ChatMessage;
        qc.setQueryData<ChatData>(['chat', id], prev => (prev && !prev.messages.some(m => m.id === msg.id) ? { ...prev, messages: [...prev.messages, msg] } : prev));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, qc]);

  const messages = q.data?.messages ?? [];
  const senders = q.data?.senders ?? {};
  useEffect(() => {
    if (messages.length) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
  }, [messages.length]);

  async function handleSend() {
    const text = body.trim();
    if (!text || sending || !q.data) return;
    setSending(true);
    setError('');
    try {
      await sendMessage({ gameId: id, userId, text, senderName: senders[userId]?.name ?? 'Jogador', gameLabel: q.data.gameLabel });
      setBody('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <View className="flex-1 bg-gray-50">
      <SafeAreaView edges={['top']} className="bg-violet-600">
        <View className="bg-violet-600 px-6 py-4 flex-row items-center gap-3">
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} accessibilityLabel="Voltar" hitSlop={10}>
            <ArrowLeft size={24} color="#ffffff" />
          </Pressable>
          <View className="flex-1">
            <Text className="text-lg font-bold text-white">Chat da partida</Text>
            {!!q.data?.gameLabel && (
              <Text className="text-xs text-violet-100" numberOfLines={1}>
                {q.data.gameLabel}
              </Text>
            )}
          </View>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {q.isPending ? (
          <View className="flex-1 items-center justify-center py-10">
            <ActivityIndicator color={palette.gray['400']} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={m => m.id}
            contentContainerClassName="px-4 py-4 gap-3 flex-grow"
            keyboardDismissMode="interactive"
            ListEmptyComponent={
              <Text className="text-sm text-gray-400 text-center py-10">{q.isError ? 'Não foi possível carregar as mensagens.' : 'Nenhuma mensagem ainda. Comece a conversa!'}</Text>
            }
            renderItem={({ item: m }) => {
              const mine = m.sender_id === userId;
              const sender = senders[m.sender_id];
              return (
                <View className={`flex-row items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                  {!mine &&
                    (sender?.avatarUrl ? (
                      <Image source={{ uri: sender.avatarUrl }} style={{ width: 28, height: 28, borderRadius: 14 }} contentFit="cover" />
                    ) : (
                      <View className="w-7 h-7 rounded-full bg-violet-600 items-center justify-center">
                        <Text className="text-white text-xs font-bold">{(sender?.name ?? '?').charAt(0).toUpperCase()}</Text>
                      </View>
                    ))}
                  <View className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 ${mine ? 'bg-violet-600 rounded-br-sm' : 'bg-white border border-gray-200 rounded-bl-sm'}`}>
                    {!mine && <Text className="text-[12px] font-semibold text-violet-600 mb-0.5">{sender?.name ?? 'Jogador'}</Text>}
                    <Text className={`text-sm ${mine ? 'text-white' : 'text-gray-900'}`}>{m.body}</Text>
                    <Text className={`text-[11px] mt-1 ${mine ? 'text-violet-200' : 'text-gray-400'}`}>{formatTime(m.created_at)}</Text>
                  </View>
                </View>
              );
            }}
          />
        )}

        {!!error && <Text className="px-4 text-xs text-red-600 mb-1">{error}</Text>}

        <SafeAreaView edges={['bottom']} className="bg-white border-t border-gray-200">
          <View className="px-4 py-3 flex-row items-center gap-2">
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="Escreva uma mensagem..."
              placeholderTextColor={palette.gray['400']}
              className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-full text-sm text-gray-900"
              style={{ fontFamily: 'Inter_400Regular' }}
              returnKeyType="send"
              onSubmitEditing={handleSend}
              submitBehavior="submit"
              accessibilityLabel="Mensagem"
            />
            <Pressable
              onPress={handleSend}
              disabled={sending || !body.trim()}
              accessibilityRole="button"
              accessibilityLabel="Enviar"
              className={`w-10 h-10 bg-violet-600 rounded-full items-center justify-center ${sending || !body.trim() ? 'opacity-40' : ''}`}
            >
              {sending ? <ActivityIndicator size="small" color="#ffffff" /> : <Send size={16} color="#ffffff" />}
            </Pressable>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  );
}
