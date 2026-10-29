// Port of src/app/components/PrivacyPage.tsx (web). Public route, like on the web.
// Content copied verbatim — it lists data the app does not collect (CPF, birth date)
// and a placeholder phone; it must be reviewed before store submission.
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Bell, Database, Eye, Lock, Share2, Shield, Trash2 } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { PageHeader } from '@/components/ui/PageHeader';
import palette from '../../tailwind.palette';

const DATA_COLLECTED = [
  { Icon: Lock, title: 'Dados Pessoais', items: ['Nome completo', 'E-mail', 'Telefone', 'Data de nascimento', 'CPF (para pagamentos)'] },
  { Icon: Database, title: 'Dados de Uso', items: ['Histórico de jogos', 'Estatísticas de desempenho', 'Preferências de quadras', 'Interações no app'] },
  { Icon: Share2, title: 'Dados de Pagamento', items: ['Informações de cartão (criptografadas)', 'Histórico de transações', 'Métodos de pagamento'] },
];

const DATA_USAGE = [
  { Icon: Eye, title: 'Como usamos seus dados', description: 'Utilizamos suas informações para processar reservas, facilitar pagamentos, personalizar sua experiência e melhorar nossos serviços.' },
  { Icon: Shield, title: 'Segurança', description: 'Seus dados são protegidos com criptografia de ponta a ponta. Utilizamos SSL/TLS para todas as comunicações.' },
  { Icon: Share2, title: 'Compartilhamento', description: 'Compartilhamos apenas informações necessárias com quadras parceiras para processar reservas. Nunca vendemos seus dados a terceiros.' },
  { Icon: Bell, title: 'Cookies e Rastreamento', description: 'Usamos cookies essenciais para funcionamento do app e cookies analíticos (opcional) para melhorar a experiência.' },
];

const RIGHTS = [
  'Acessar seus dados pessoais a qualquer momento',
  'Solicitar correção de dados incorretos',
  'Exportar todos os seus dados em formato legível',
  'Solicitar exclusão completa de sua conta',
  'Revogar consentimentos dados anteriormente',
  'Opor-se ao processamento de dados para marketing',
];

export default function Privacy() {
  return (
    <View className="flex-1 bg-gray-50">
      <PageHeader title="Política de Privacidade" />
      <ScrollView contentContainerClassName="px-6 py-6 gap-6 pb-12">
        <LinearGradient
          colors={[palette.purple['600'], palette.purple['700']]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: 16, padding: 24 }}
        >
          <View className="flex-row items-start gap-4 mb-4">
            <View className="w-12 h-12 bg-white/20 rounded-xl items-center justify-center">
              <Shield size={24} color="#ffffff" />
            </View>
            <View className="flex-1">
              <Text className="text-xl font-bold mb-2 text-white">Sua privacidade é nossa prioridade</Text>
              <Text className="text-sm text-purple-100">Última atualização: 27 de fevereiro de 2026</Text>
            </View>
          </View>
          <Text className="text-sm text-purple-50">
            Esta política descreve como coletamos, usamos e protegemos suas informações pessoais no JoggaHub.
          </Text>
        </LinearGradient>

        <View className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <Text className="font-semibold text-gray-900 mb-3 text-base">Compromisso com sua privacidade</Text>
          <Text className="text-sm text-gray-600 leading-relaxed">
            O JoggaHub está comprometido em proteger sua privacidade em conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei 13.709/2018).
          </Text>
        </View>

        <View>
          <Text className="font-semibold text-gray-900 mb-3 px-2 text-base">Dados que Coletamos</Text>
          <View className="gap-3">
            {DATA_COLLECTED.map(({ Icon, title, items }) => (
              <View key={title} className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
                <View className="flex-row items-center gap-3 mb-3">
                  <View className="w-10 h-10 bg-purple-100 rounded-lg items-center justify-center">
                    <Icon size={20} color={palette.purple['600']} />
                  </View>
                  <Text className="font-semibold text-gray-900 text-base">{title}</Text>
                </View>
                <View className="gap-1">
                  {items.map(item => (
                    <View key={item} className="flex-row items-start gap-2">
                      <Text className="text-purple-600 text-sm">•</Text>
                      <Text className="text-sm text-gray-600 flex-1">{item}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        </View>

        <View>
          <Text className="font-semibold text-gray-900 mb-3 px-2 text-base">Como Protegemos e Usamos</Text>
          <View className="gap-3">
            {DATA_USAGE.map(({ Icon, title, description }) => (
              <View key={title} className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
                <View className="flex-row items-start gap-3">
                  <View className="w-10 h-10 bg-violet-100 rounded-lg items-center justify-center">
                    <Icon size={20} color={palette.violet['600']} />
                  </View>
                  <View className="flex-1">
                    <Text className="font-semibold text-gray-900 mb-1 text-base">{title}</Text>
                    <Text className="text-sm text-gray-600 leading-relaxed">{description}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <Text className="font-semibold text-gray-900 mb-3 text-base">Seus Direitos (LGPD)</Text>
          <View className="gap-2">
            {RIGHTS.map(r => (
              <View key={r} className="flex-row items-start gap-2">
                <Shield size={16} color={palette.green['600']} />
                <Text className="text-sm text-gray-600 flex-1">{r}</Text>
              </View>
            ))}
          </View>
        </View>

        <View className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <View className="flex-row items-start gap-3 mb-3">
            <View className="w-10 h-10 bg-orange-100 rounded-lg items-center justify-center">
              <Trash2 size={20} color={palette.orange['600']} />
            </View>
            <View className="flex-1">
              <Text className="font-semibold text-gray-900 mb-1 text-base">Retenção de Dados</Text>
              <Text className="text-sm text-gray-600">• Dados de conta: enquanto sua conta estiver ativa</Text>
              <Text className="text-sm text-gray-600">• Histórico de transações: 5 anos (obrigação legal)</Text>
              <Text className="text-sm text-gray-600">• Dados de marketing: até você revogar o consentimento</Text>
            </View>
          </View>
        </View>

        <View className="bg-purple-50 border border-purple-200 rounded-xl p-4">
          <Text className="font-semibold text-purple-900 mb-2 text-base">Encarregado de Dados (DPO)</Text>
          <Text className="text-sm text-purple-800">
            <Text className="text-sm font-bold text-purple-800">E-mail:</Text> privacidade@joggahub.com
          </Text>
          <Text className="text-sm text-purple-800">
            <Text className="text-sm font-bold text-purple-800">Telefone:</Text> (11) 4002-8922
          </Text>
        </View>

        <View className="gap-3">
          <Pressable onPress={() => router.push('/settings')} accessibilityRole="button" className="w-full bg-violet-600 py-3 rounded-xl items-center active:bg-violet-700">
            <Text className="text-white font-semibold text-base">Gerenciar Preferências de Privacidade</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/help')} accessibilityRole="button" className="w-full bg-white py-3 rounded-xl items-center border-2 border-gray-200 active:bg-gray-50">
            <Text className="text-gray-700 font-semibold text-base">Falar com o DPO</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
