import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, ChevronDown, ChevronUp, Mail, Phone, Calendar, CreditCard, Users } from 'lucide-react';

export default function HelpPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const faqCategories = [
    { icon: Calendar, name: 'Reservas', color: 'bg-violet-100 text-violet-600', faqs: [
      { question: 'Como fazer uma reserva de quadra?', answer: 'Na tela inicial, toque em "Buscar quadras" (ou em Explorar → Encontrar Quadras), escolha a quadra, o horário disponível e confirme o pagamento.' },
      { question: 'Posso cancelar uma reserva?', answer: 'Sim. Até 24h antes do horário, o cancelamento libera o valor bloqueado no cartão, sem nenhuma cobrança. Depois desse prazo, o cancelamento pelo app fica bloqueado — entre em contato com o suporte.' }
    ]},
    { icon: Users, name: 'Jogos Abertos', color: 'bg-green-100 text-green-600', faqs: [
      { question: 'O que são jogos abertos?', answer: 'Jogos abertos são partidas criadas por outros jogadores onde você pode entrar e jogar. É uma ótima forma de conhecer novos jogadores.' },
      { question: 'Como criar um jogo aberto?', answer: 'Escolha uma quadra e um horário disponível na página da quadra e selecione a opção "Partida aberta" ao reservar. Outros jogadores poderão entrar até a partida ficar completa.' },
      { question: 'E se não completar os jogadores?', answer: 'Se o número mínimo de jogadores não for atingido até 2h antes do horário, a partida é cancelada automaticamente e o valor bloqueado no cartão de cada jogador é liberado, sem cobrança.' }
    ]},
    { icon: CreditCard, name: 'Pagamentos', color: 'bg-purple-100 text-purple-600', faqs: [
      { question: 'Quais formas de pagamento são aceitas?', answer: 'Aceitamos cartão de crédito e débito. PIX ainda não está disponível.' },
      { question: 'Como funciona o rateio de valores?', answer: 'Em jogos abertos e em partidas privadas com rateio, o valor da quadra é dividido proporcionalmente entre os jogadores confirmados, mais a taxa de serviço.' },
      { question: 'Recebi reembolso, quando cai na conta?', answer: 'Se o cancelamento acontece antes da cobrança, o valor bloqueado no cartão é apenas liberado — não há reembolso a processar. Se o valor já foi cobrado, o reembolso é processado em até 5 dias úteis, no mesmo método de pagamento.' }
    ]}
  ];

  const contactOptions = [
    { icon: Mail, title: 'E-mail', description: 'info@joggahub.com', action: 'Enviar e-mail', color: 'bg-purple-600', href: 'mailto:info@joggahub.com' },
    { icon: Phone, title: 'Telefone', description: '+353 83 085 9505', action: 'Ligar agora', color: 'bg-green-600', href: 'tel:+353830859505' }
  ];

  const toggleFaq = (categoryIndex: number, faqIndex: number) => {
    const id = categoryIndex * 100 + faqIndex;
    setExpandedFaq(expandedFaq === id ? null : id);
  };

  const filteredCategories = faqCategories.map(cat => ({
    ...cat, faqs: cat.faqs.filter(faq => faq.question.toLowerCase().includes(searchQuery.toLowerCase()) || faq.answer.toLowerCase().includes(searchQuery.toLowerCase()))
  })).filter(cat => cat.faqs.length > 0);

  const displayCategories = searchQuery ? filteredCategories : faqCategories;

  return (
    <div className="min-h-screen bg-gray-50 pb-6">
      <div className="bg-white border-b border-gray-200">
        <div className="px-6 py-4">
          <div className="flex items-center gap-4 mb-4">
            <button onClick={() => navigate(-1)} className="text-gray-600 hover:text-gray-900"><ArrowLeft className="w-6 h-6" /></button>
            <h1 className="text-xl font-bold text-gray-900">Central de Ajuda</h1>
          </div>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input type="text" placeholder="Buscar por tópicos..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500" />
          </div>
        </div>
      </div>

      <div className="px-6 py-6 space-y-6">
        <div>
          <h2 className="font-semibold text-gray-900 mb-3 px-2">Fale conosco</h2>
          <div className="grid grid-cols-1 gap-3">
            {contactOptions.map((option, index) => {
              const Icon = option.icon;
              return (
                <a key={index} href={option.href} className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 flex items-center gap-4 hover:bg-gray-50 transition-colors">
                  <div className={`w-12 h-12 ${option.color} rounded-xl flex items-center justify-center text-white`}><Icon className="w-6 h-6" /></div>
                  <div className="flex-1 text-left"><h3 className="font-semibold text-gray-900">{option.title}</h3><p className="text-sm text-gray-500">{option.description}</p></div>
                  <span className="text-sm text-violet-600 font-semibold">{option.action}</span>
                </a>
              );
            })}
          </div>
        </div>

        <div>
          <h2 className="font-semibold text-gray-900 mb-3 px-2">Perguntas Frequentes</h2>
          <div className="space-y-4">
            {displayCategories.map((category, categoryIndex) => {
              const Icon = category.icon;
              return (
                <div key={categoryIndex}>
                  <div className="flex items-center gap-2 mb-2 px-2">
                    <div className={`w-8 h-8 ${category.color} rounded-lg flex items-center justify-center`}><Icon className="w-5 h-5" /></div>
                    <h3 className="font-semibold text-gray-900">{category.name}</h3>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                    {category.faqs.map((faq, faqIndex) => {
                      const id = categoryIndex * 100 + faqIndex;
                      const isExpanded = expandedFaq === id;
                      return (
                        <div key={faqIndex} className={faqIndex !== category.faqs.length - 1 ? 'border-b border-gray-100' : ''}>
                          <button onClick={() => toggleFaq(categoryIndex, faqIndex)} className="w-full p-4 flex items-start justify-between hover:bg-gray-50 transition-colors">
                            <h4 className="font-semibold text-gray-900 text-left pr-4">{faq.question}</h4>
                            {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />}
                          </button>
                          {isExpanded && <div className="px-4 pb-4"><p className="text-sm text-gray-600 leading-relaxed">{faq.answer}</p></div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {searchQuery && filteredCategories.length === 0 && (
              <div className="text-center py-12"><Search className="w-12 h-12 text-gray-300 mx-auto mb-3" /><p className="text-gray-500">Nenhum resultado encontrado</p></div>
            )}
          </div>
        </div>

        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
          <h3 className="font-semibold text-violet-900 mb-2">Ainda precisa de ajuda?</h3>
          <p className="text-sm text-violet-800 mb-3">Nossa equipe está pronta para ajudar você com qualquer dúvida!</p>
          <a href="mailto:info@joggahub.com" className="block text-center w-full bg-violet-600 text-white py-3 rounded-lg font-semibold hover:bg-violet-700 transition-colors">Falar com suporte</a>
        </div>
      </div>
    </div>
  );
}
