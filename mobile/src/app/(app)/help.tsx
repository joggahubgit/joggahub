// Port of src/app/components/HelpPage.tsx (web).
import { useState } from 'react';
import { Linking, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, Calendar, ChevronDown, ChevronUp, CreditCard, Mail, Phone, Search, Users } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import palette from '../../../tailwind.palette';

const CATEGORIES = [
  {
    Icon: Calendar, name: 'Reservas', bg: 'bg-violet-100', fg: palette.violet['600'],
    faqs: [
      { q: 'Como fazer uma reserva de quadra?', a: 'Na tela inicial, toque em "Buscar quadras" (ou em Explorar → Encontrar Quadras), escolha a quadra, o horário disponível e confirme o pagamento.' },
      { q: 'Posso cancelar uma reserva?', a: 'Sim. Até 24h antes do horário, o cancelamento libera o valor bloqueado no cartão, sem nenhuma cobrança. Depois desse prazo, o cancelamento pelo app fica bloqueado — entre em contato com o suporte.' },
    ],
  },
  {
    Icon: Users, name: 'Jogos Abertos', bg: 'bg-green-100', fg: palette.green['600'],
    faqs: [
      { q: 'O que são jogos abertos?', a: 'Jogos abertos são partidas criadas por outros jogadores onde você pode entrar e jogar. É uma ótima forma de conhecer novos jogadores.' },
      { q: 'Como criar um jogo aberto?', a: 'Escolha uma quadra e um horário disponível na página da quadra e selecione a opção "Partida aberta" ao reservar. Outros jogadores poderão entrar até a partida ficar completa.' },
      { q: 'E se não completar os jogadores?', a: 'Se o número mínimo de jogadores não for atingido até 2h antes do horário, a partida é cancelada automaticamente e o valor bloqueado no cartão de cada jogador é liberado, sem cobrança.' },
    ],
  },
  {
    Icon: CreditCard, name: 'Pagamentos', bg: 'bg-purple-100', fg: palette.purple['600'],
    faqs: [
      { q: 'Quais formas de pagamento são aceitas?', a: 'Aceitamos cartão de crédito e débito. PIX ainda não está disponível.' },
      { q: 'Como funciona o rateio de valores?', a: 'Em jogos abertos e em partidas privadas com rateio, o valor da quadra é dividido proporcionalmente entre os jogadores confirmados, mais a taxa de serviço.' },
      { q: 'Recebi reembolso, quando cai na conta?', a: 'Se o cancelamento acontece antes da cobrança, o valor bloqueado no cartão é apenas liberado — não há reembolso a processar. Se o valor já foi cobrado, o reembolso é processado em até 5 dias úteis, no mesmo método de pagamento.' },
    ],
  },
];

const CONTACTS = [
  { Icon: Mail, title: 'E-mail', description: 'info@joggahub.com', action: 'Enviar e-mail', bg: 'bg-purple-600', href: 'mailto:info@joggahub.com' },
  { Icon: Phone, title: 'Telefone', description: '+353 83 085 9505', action: 'Ligar agora', bg: 'bg-green-600', href: 'tel:+353830859505' },
];

export default function Help() {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const term = query.toLowerCase();
  const filtered = CATEGORIES.map(c => ({ ...c, faqs: c.faqs.filter(f => f.q.toLowerCase().includes(term) || f.a.toLowerCase().includes(term)) })).filter(c => c.faqs.length);
  const shown = query ? filtered : CATEGORIES;

  return (
    <View className="flex-1 bg-gray-50">
      <SafeAreaView edges={['top']} className="bg-white border-b border-gray-200">
        <View className="px-6 py-4">
          <View className="flex-row items-center gap-4 mb-4">
            <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Voltar" hitSlop={12}>
              <ArrowLeft size={24} color={palette.gray['600']} />
            </Pressable>
            <Text className="text-xl font-bold text-gray-900">Central de Ajuda</Text>
          </View>
          <View className="flex-row items-center bg-gray-50 border border-gray-200 rounded-xl px-4">
            <Search size={20} color={palette.gray['400']} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar por tópicos..."
              placeholderTextColor={palette.gray['400']}
              className="flex-1 py-3 pl-4 text-base text-gray-900"
              style={{ fontFamily: 'Inter_400Regular' }}
              accessibilityLabel="Buscar por tópicos"
            />
          </View>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerClassName="px-6 py-6 gap-6 pb-12" keyboardShouldPersistTaps="handled">
        <View>
          <Text className="font-semibold text-gray-900 mb-3 px-2 text-base">Fale conosco</Text>
          <View className="gap-3">
            {CONTACTS.map(({ Icon, ...c }) => (
              <Pressable
                key={c.title}
                onPress={() => Linking.openURL(c.href)}
                accessibilityRole="link"
                className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 flex-row items-center gap-4 active:bg-gray-50"
              >
                <View className={`w-12 h-12 ${c.bg} rounded-xl items-center justify-center`}>
                  <Icon size={24} color="#ffffff" />
                </View>
                <View className="flex-1">
                  <Text className="font-semibold text-gray-900 text-base">{c.title}</Text>
                  <Text className="text-sm text-gray-500">{c.description}</Text>
                </View>
                <Text className="text-sm text-violet-600 font-semibold">{c.action}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View>
          <Text className="font-semibold text-gray-900 mb-3 px-2 text-base">Perguntas Frequentes</Text>
          <View className="gap-4">
            {shown.map(({ Icon, ...cat }) => (
              <View key={cat.name}>
                <View className="flex-row items-center gap-2 mb-2 px-2">
                  <View className={`w-8 h-8 ${cat.bg} rounded-lg items-center justify-center`}>
                    <Icon size={20} color={cat.fg} />
                  </View>
                  <Text className="font-semibold text-gray-900 text-base">{cat.name}</Text>
                </View>
                <View className="bg-white rounded-xl shadow-sm overflow-hidden">
                  {cat.faqs.map((f, i) => {
                    const id = `${cat.name}-${i}`;
                    const open = expanded === id;
                    return (
                      <View key={id} className={i !== cat.faqs.length - 1 ? 'border-b border-gray-100' : ''}>
                        <Pressable
                          onPress={() => setExpanded(open ? null : id)}
                          accessibilityRole="button"
                          accessibilityState={{ expanded: open }}
                          className="w-full p-4 flex-row items-start justify-between active:bg-gray-50"
                        >
                          <Text className="font-semibold text-gray-900 pr-4 flex-1 text-base">{f.q}</Text>
                          {open ? <ChevronUp size={20} color={palette.gray['400']} /> : <ChevronDown size={20} color={palette.gray['400']} />}
                        </Pressable>
                        {open && (
                          <View className="px-4 pb-4">
                            <Text className="text-sm text-gray-600 leading-relaxed">{f.a}</Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}
            {!!query && filtered.length === 0 && (
              <View className="items-center py-12">
                <Search size={48} color={palette.gray['300']} />
                <Text className="text-gray-500 mt-3 text-base">Nenhum resultado encontrado</Text>
              </View>
            )}
          </View>
        </View>

        <View className="bg-violet-50 border border-violet-200 rounded-xl p-4">
          <Text className="font-semibold text-violet-900 mb-2 text-base">Ainda precisa de ajuda?</Text>
          <Text className="text-sm text-violet-800 mb-3">Nossa equipe está pronta para ajudar você com qualquer dúvida!</Text>
          <Pressable
            onPress={() => Linking.openURL('mailto:info@joggahub.com')}
            accessibilityRole="link"
            className="w-full bg-violet-600 py-3 rounded-lg items-center active:bg-violet-700"
          >
            <Text className="text-white font-semibold text-base">Falar com suporte</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
