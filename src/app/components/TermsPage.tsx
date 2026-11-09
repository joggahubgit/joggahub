import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, CheckCircle } from 'lucide-react';

export default function TermsPage() {
  const navigate = useNavigate();

  const sections = [
    { title: '1. Aceitação dos Termos', content: 'Ao acessar e usar o JoggaHub, você concorda em cumprir e estar vinculado aos seguintes termos e condições de uso.' },
    { title: '2. Descrição do Serviço', content: 'O JoggaHub é uma plataforma digital que conecta jogadores amadores de futebol e facilita a reserva de quadras esportivas.' },
    { title: '3. Cadastro e Conta de Usuário', content: 'Para utilizar nossos serviços, você deve criar uma conta fornecendo informações precisas e completas. É obrigatório ter pelo menos 16 anos de idade.' },
    { title: '4. Reservas e Pagamentos', content: 'Todas as reservas estão sujeitas à disponibilidade. Os pagamentos são processados pelo Stripe. Na maioria dos casos o valor fica apenas reservado (pré-autorizado) no seu cartão e só é cobrado perto do horário:\n\n• Partida aberta, partida fechada com divisão, day use e curso: cobrança 2h antes do início (no curso, da primeira aula). Na partida aberta e na divisão, o valor cobrado pode ser menor que o reservado, conforme o número de jogadores confirmados.\n\n• Partida fechada com pagamento total: cobrança 24h antes do início.\n\n• Reservas feitas com mais de 6 dias de antecedência: nada é cobrado na hora. Seu cartão fica salvo e o valor é reservado automaticamente 6 dias antes do início. Se o banco recusar, você é avisado e tem 24h para pagar pelo app ("Pagar agora"); sem o pagamento, a vaga é cancelada.\n\n• A taxa de serviço JoggaHub (8% + R$ 2,50 por transação) é somada ao valor de cada jogador e aparece antes do pagamento. Todos os horários e prazos seguem o horário de Brasília.' },
    { title: '5. Política de Cancelamento', content: '• Desistência pelo jogador: sem custo até 24h antes do início (no curso, da primeira aula). Se o valor estava só reservado, ele é liberado; se já tinha sido cobrado, é reembolsado integralmente.\n\n• Depois desse prazo, não é possível desistir pelo app. O clube pode autorizar a saída: nesse caso você recebe tudo de volta, menos a taxa de serviço JoggaHub.\n\n• Partida aberta que não atingir o mínimo de jogadores até 2h antes do início é cancelada automaticamente, e os valores reservados são liberados sem custo.\n\n• Partida fechada com divisão: se o mínimo de jogadores não for atingido até a cobrança, o organizador cobre a diferença. Na partida fechada com pagamento total, os jogadores adicionados pelo link não pagam nada.\n\n• Cancelamento pelo clube: você recebe o valor integral de volta, inclusive a taxa de serviço.\n\n• Reembolsos voltam para o mesmo cartão, e o prazo de crédito depende do banco. Valores que estavam apenas reservados são liberados pelo banco, normalmente em poucos dias.' },
    { title: '6. Conduta do Usuário', content: 'Você concorda em usar o JoggaHub apenas para fins legais. É proibido publicar conteúdo ofensivo, usar a plataforma para atividades fraudulentas ou fazer reservas falsas.' },
    { title: '7. Responsabilidades e Limitações', content: 'O JoggaHub atua como intermediário entre jogadores e quadras esportivas. Não somos responsáveis por lesões ou danos ocorridos durante os jogos.' },
    { title: '8. Propriedade Intelectual', content: 'Todo o conteúdo disponível no JoggaHub é propriedade do JoggaHub ou de seus fornecedores e está protegido por leis de direitos autorais.' },
    { title: '9. Modificações dos Termos', content: 'Reservamo-nos o direito de modificar estes termos a qualquer momento. Alterações significativas serão notificadas através do aplicativo ou por e-mail.' },
    { title: '10. Lei Aplicável', content: 'Estes termos são regidos pelas leis da República Federativa do Brasil. Qualquer disputa será resolvida nos tribunais da comarca de São Paulo, SP.' },
    { title: '11. Contato', content: 'Para questões sobre estes termos, entre em contato através do e-mail info@joggahub.com ou pelo telefone +353 83 085 9505.' }
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-6">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-6 py-4">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="text-gray-600 hover:text-gray-900"><ArrowLeft className="w-6 h-6" /></button>
            <h1 className="text-xl font-bold text-gray-900">Termos de Uso</h1>
          </div>
        </div>
      </div>

      <div className="px-6 py-6 space-y-6">
        <div className="bg-gradient-to-br from-violet-600 to-violet-700 rounded-2xl p-6 text-white">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm flex-shrink-0"><FileText className="w-6 h-6" /></div>
            <div><h2 className="text-xl font-bold mb-2">Termos de Uso do JoggaHub</h2><p className="text-sm text-violet-100">Última atualização: 9 de novembro de 2026</p></div>
          </div>
          <p className="text-sm text-violet-50">Leia atentamente estes termos antes de utilizar nossos serviços.</p>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <h3 className="font-semibold text-gray-900 mb-3">Pontos Principais</h3>
          <div className="space-y-2">
            {['Idade mínima de 16 anos para usar a plataforma', 'Desistência sem custo até 24h antes do início', 'O valor fica reservado no cartão e é cobrado perto do horário; com mais de 6 dias de antecedência, o cartão fica salvo e a reserva é feita 6 dias antes', 'Se o clube cancelar, você recebe tudo de volta', 'Conduta respeitosa é obrigatória'].map((point, i) => (
              <div key={i} className="flex items-start gap-2"><CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" /><p className="text-sm text-gray-600">{point}</p></div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {sections.map((section, index) => (
            <div key={index} className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-2">{section.title}</h3>
              <div className="text-sm text-gray-600 leading-relaxed space-y-2">
                {section.content.split('\n\n').map((block, i) => (
                  <p key={i}>{block}</p>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
          <h3 className="font-semibold text-violet-900 mb-2">Dúvidas sobre os termos?</h3>
          <p className="text-sm text-violet-800 mb-3">Nossa equipe jurídica está disponível para esclarecer qualquer questão.</p>
          <button onClick={() => navigate('/help')} className="w-full bg-violet-600 text-white py-3 rounded-lg font-semibold hover:bg-violet-700 transition-colors">Falar com suporte</button>
        </div>

        <div className="text-center text-sm text-gray-500"><p>Ao continuar usando o JoggaHub, você confirma que leu e concordou com estes Termos de Uso.</p></div>
      </div>
    </div>
  );
}
