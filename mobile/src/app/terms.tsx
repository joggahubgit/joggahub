// Port of src/app/components/TermsPage.tsx (web). Public route, like on the web.
// Content copied verbatim — note the contact phone/email need review before store submission.
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { CheckCircle, FileText } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { PageHeader } from '@/components/ui/PageHeader';
import palette from '../../tailwind.palette';

const SECTIONS = [
  { title: '1. Aceitação dos Termos', content: 'Ao acessar e usar o JoggaHub, você concorda em cumprir e estar vinculado aos seguintes termos e condições de uso.' },
  { title: '2. Descrição do Serviço', content: 'O JoggaHub é uma plataforma digital que conecta jogadores amadores de futebol e facilita a reserva de quadras esportivas.' },
  { title: '3. Cadastro e Conta de Usuário', content: 'Para utilizar nossos serviços, você deve criar uma conta fornecendo informações precisas e completas. É obrigatório ter pelo menos 16 anos de idade.' },
  { title: '4. Reservas e Pagamentos', content: 'Todas as reservas estão sujeitas à disponibilidade e confirmação. Os pagamentos são processados via Stripe com tecnologia de bloqueio temporário (hold): o valor é reservado no cartão no momento da inscrição e cobrado efetivamente apenas quando a partida for confirmada, conforme as regras de cada modalidade. A taxa de serviço JoggaHub (8% + R$ 2,50 por transação) é aplicada sobre o valor de cada jogador.' },
  { title: '5. Política de Cancelamento', content: 'As regras de cancelamento variam por tipo de partida:\n\n• Partida Aberta: cancelamento com reembolso integral permitido até 24h antes do início. Após 24h, cancelamentos não são aceitos. Se o número mínimo de jogadores não for atingido até 2h antes do início, a partida é cancelada automaticamente e todos os bloqueios são liberados sem custo.\n\n• Partida Privada (Pagamento Total): o organizador pode cancelar com reembolso integral até 24h antes. Após 24h, o cancelamento é bloqueado e o valor é capturado automaticamente. Jogadores adicionados via link não têm custo e podem sair até 24h antes.\n\n• Partida Privada (Divisão): cancelamento com reembolso integral até 24h antes para todos os participantes. Após 24h, cancelamentos são bloqueados. A cobrança final ocorre 2h antes do início, proporcional ao número de jogadores confirmados — se o mínimo não for atingido, o organizador cobre a diferença.' },
  { title: '6. Conduta do Usuário', content: 'Você concorda em usar o JoggaHub apenas para fins legais. É proibido publicar conteúdo ofensivo, usar a plataforma para atividades fraudulentas ou fazer reservas falsas.' },
  { title: '7. Responsabilidades e Limitações', content: 'O JoggaHub atua como intermediário entre jogadores e quadras esportivas. Não somos responsáveis por lesões ou danos ocorridos durante os jogos.' },
  { title: '8. Propriedade Intelectual', content: 'Todo o conteúdo disponível no JoggaHub é propriedade do JoggaHub ou de seus fornecedores e está protegido por leis de direitos autorais.' },
  { title: '9. Modificações dos Termos', content: 'Reservamo-nos o direito de modificar estes termos a qualquer momento. Alterações significativas serão notificadas através do aplicativo ou por e-mail.' },
  { title: '10. Lei Aplicável', content: 'Estes termos são regidos pelas leis da República Federativa do Brasil. Qualquer disputa será resolvida nos tribunais da comarca de São Paulo, SP.' },
  { title: '11. Contato', content: 'Para questões sobre estes termos, entre em contato através do e-mail juridico@joggahub.com ou pelo telefone (11) 4002-8922.' },
];

const POINTS = [
  'Idade mínima de 16 anos para usar a plataforma',
  'Cancelamento com reembolso integral até 24h antes — após isso, sem reembolso',
  'O valor é bloqueado no cartão e cobrado apenas quando a partida for confirmada',
  'Conduta respeitosa é obrigatória',
];

export default function Terms() {
  return (
    <View className="flex-1 bg-gray-50">
      <PageHeader title="Termos de Uso" />
      <ScrollView contentContainerClassName="px-6 py-6 gap-6 pb-12">
        <LinearGradient
          colors={[palette.violet['600'], palette.violet['700']]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: 16, padding: 24 }}
        >
          <View className="flex-row items-start gap-4 mb-4">
            <View className="w-12 h-12 bg-white/20 rounded-xl items-center justify-center">
              <FileText size={24} color="#ffffff" />
            </View>
            <View className="flex-1">
              <Text className="text-xl font-bold mb-2 text-white">Termos de Uso do JoggaHub</Text>
              <Text className="text-sm text-violet-100">Última atualização: 15 de julho de 2026</Text>
            </View>
          </View>
          <Text className="text-sm text-violet-50">Leia atentamente estes termos antes de utilizar nossos serviços.</Text>
        </LinearGradient>

        <View className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <Text className="font-semibold text-gray-900 mb-3 text-base">Pontos Principais</Text>
          <View className="gap-2">
            {POINTS.map(p => (
              <View key={p} className="flex-row items-start gap-2">
                <CheckCircle size={20} color={palette.green['600']} />
                <Text className="text-sm text-gray-600 flex-1">{p}</Text>
              </View>
            ))}
          </View>
        </View>

        <View className="gap-4">
          {SECTIONS.map(s => (
            <View key={s.title} className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
              <Text className="font-semibold text-gray-900 mb-2 text-base">{s.title}</Text>
              <View className="gap-2">
                {s.content.split('\n\n').map(block => (
                  <Text key={block} className="text-sm text-gray-600 leading-relaxed">
                    {block}
                  </Text>
                ))}
              </View>
            </View>
          ))}
        </View>

        <View className="bg-violet-50 border border-violet-200 rounded-xl p-4">
          <Text className="font-semibold text-violet-900 mb-2 text-base">Dúvidas sobre os termos?</Text>
          <Text className="text-sm text-violet-800 mb-3">Nossa equipe jurídica está disponível para esclarecer qualquer questão.</Text>
          <Pressable onPress={() => router.push('/help')} accessibilityRole="button" className="w-full bg-violet-600 py-3 rounded-lg items-center active:bg-violet-700">
            <Text className="text-white font-semibold text-base">Falar com suporte</Text>
          </Pressable>
        </View>

        <Text className="text-center text-sm text-gray-500">
          Ao continuar usando o JoggaHub, você confirma que leu e concordou com estes Termos de Uso.
        </Text>
      </ScrollView>
    </View>
  );
}
