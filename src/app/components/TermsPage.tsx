import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, CheckCircle } from 'lucide-react';

export default function TermsPage() {
  const navigate = useNavigate();

  const sections = [
    { title: '1. Aceitação dos Termos', content: 'Ao acessar e usar o JoggaHub, você concorda em cumprir e estar vinculado aos seguintes termos e condições de uso.' },
    { title: '2. Descrição do Serviço', content: 'O JoggaHub é uma plataforma digital que conecta jogadores amadores de futebol e facilita a reserva de quadras esportivas.' },
    { title: '3. Cadastro e Conta de Usuário', content: 'Para utilizar nossos serviços, você deve criar uma conta fornecendo informações precisas e completas. É obrigatório ter pelo menos 16 anos de idade.' },
    { title: '4. Reservas e Pagamentos', content: 'Todas as reservas estão sujeitas à disponibilidade e confirmação. Os pagamentos devem ser realizados através dos métodos aceitos pela plataforma.' },
    { title: '5. Política de Cancelamento', content: 'Cancelamentos com mais de 24h: reembolso integral. Entre 12-24h: taxa de 50%. Menos de 12h: sem reembolso. Em caso de condições climáticas extremas, reembolso integral.' },
    { title: '6. Conduta do Usuário', content: 'Você concorda em usar o JoggaHub apenas para fins legais. É proibido publicar conteúdo ofensivo, usar a plataforma para atividades fraudulentas ou fazer reservas falsas.' },
    { title: '7. Responsabilidades e Limitações', content: 'O JoggaHub atua como intermediário entre jogadores e quadras esportivas. Não somos responsáveis por lesões ou danos ocorridos durante os jogos.' },
    { title: '8. Propriedade Intelectual', content: 'Todo o conteúdo disponível no JoggaHub é propriedade do JoggaHub ou de seus fornecedores e está protegido por leis de direitos autorais.' },
    { title: '9. Modificações dos Termos', content: 'Reservamo-nos o direito de modificar estes termos a qualquer momento. Alterações significativas serão notificadas através do aplicativo ou por e-mail.' },
    { title: '10. Lei Aplicável', content: 'Estes termos são regidos pelas leis da República Federativa do Brasil. Qualquer disputa será resolvida nos tribunais da comarca de São Paulo, SP.' },
    { title: '11. Contato', content: 'Para questões sobre estes termos, entre em contato através do e-mail juridico@joggahub.com ou pelo telefone (11) 4002-8922.' }
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
            <div><h2 className="text-xl font-bold mb-2">Termos de Uso do JoggaHub</h2><p className="text-sm text-violet-100">Última atualização: 27 de fevereiro de 2026</p></div>
          </div>
          <p className="text-sm text-violet-50">Leia atentamente estes termos antes de utilizar nossos serviços.</p>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <h3 className="font-semibold text-gray-900 mb-3">Pontos Principais</h3>
          <div className="space-y-2">
            {['Idade mínima de 16 anos para usar a plataforma', 'Cancelamento gratuito até 24h antes do jogo', 'Você é responsável pela segurança de sua conta', 'Conduta respeitosa é obrigatória'].map((point, i) => (
              <div key={i} className="flex items-start gap-2"><CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" /><p className="text-sm text-gray-600">{point}</p></div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {sections.map((section, index) => (
            <div key={index} className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-2">{section.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{section.content}</p>
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
