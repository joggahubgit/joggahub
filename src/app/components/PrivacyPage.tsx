import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Lock, Eye, Database, Share2, Bell, Trash2 } from 'lucide-react';

export default function PrivacyPage() {
  const navigate = useNavigate();

  const dataCollected = [
    { icon: Lock, title: 'Dados Pessoais', items: ['Nome completo', 'E-mail', 'Telefone', 'Data de nascimento', 'CPF (para pagamentos)'] },
    { icon: Database, title: 'Dados de Uso', items: ['Histórico de jogos', 'Estatísticas de desempenho', 'Preferências de quadras', 'Interações no app'] },
    { icon: Share2, title: 'Dados de Pagamento', items: ['Informações de cartão (criptografadas)', 'Histórico de transações', 'Métodos de pagamento'] }
  ];

  const dataUsage = [
    { icon: Eye, title: 'Como usamos seus dados', description: 'Utilizamos suas informações para processar reservas, facilitar pagamentos, personalizar sua experiência e melhorar nossos serviços.' },
    { icon: Shield, title: 'Segurança', description: 'Seus dados são protegidos com criptografia de ponta a ponta. Utilizamos SSL/TLS para todas as comunicações.' },
    { icon: Share2, title: 'Compartilhamento', description: 'Compartilhamos apenas informações necessárias com quadras parceiras para processar reservas. Nunca vendemos seus dados a terceiros.' },
    { icon: Bell, title: 'Cookies e Rastreamento', description: 'Usamos cookies essenciais para funcionamento do app e cookies analíticos (opcional) para melhorar a experiência.' }
  ];

  const yourRights = [
    'Acessar seus dados pessoais a qualquer momento', 'Solicitar correção de dados incorretos',
    'Exportar todos os seus dados em formato legível', 'Solicitar exclusão completa de sua conta',
    'Revogar consentimentos dados anteriormente', 'Opor-se ao processamento de dados para marketing'
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-6">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-6 py-4">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="text-gray-600 hover:text-gray-900"><ArrowLeft className="w-6 h-6" /></button>
            <h1 className="text-xl font-bold text-gray-900">Política de Privacidade</h1>
          </div>
        </div>
      </div>

      <div className="px-6 py-6 space-y-6">
        <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-2xl p-6 text-white">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm flex-shrink-0"><Shield className="w-6 h-6" /></div>
            <div><h2 className="text-xl font-bold mb-2">Sua privacidade é nossa prioridade</h2><p className="text-sm text-purple-100">Última atualização: 27 de fevereiro de 2026</p></div>
          </div>
          <p className="text-sm text-purple-50">Esta política descreve como coletamos, usamos e protegemos suas informações pessoais no JoggaHub.</p>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <h3 className="font-semibold text-gray-900 mb-3">Compromisso com sua privacidade</h3>
          <p className="text-sm text-gray-600 leading-relaxed">O JoggaHub está comprometido em proteger sua privacidade em conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei 13.709/2018).</p>
        </div>

        <div>
          <h2 className="font-semibold text-gray-900 mb-3 px-2">Dados que Coletamos</h2>
          <div className="space-y-3">
            {dataCollected.map((category, index) => {
              const Icon = category.icon;
              return (
                <div key={index} className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
                  <div className="flex items-center gap-3 mb-3"><div className="w-10 h-10 bg-purple-100 text-purple-600 rounded-lg flex items-center justify-center"><Icon className="w-5 h-5" /></div><h3 className="font-semibold text-gray-900">{category.title}</h3></div>
                  <ul className="space-y-1">{category.items.map((item, i) => <li key={i} className="text-sm text-gray-600 flex items-start gap-2"><span className="text-purple-600 mt-1">•</span><span>{item}</span></li>)}</ul>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h2 className="font-semibold text-gray-900 mb-3 px-2">Como Protegemos e Usamos</h2>
          <div className="space-y-3">
            {dataUsage.map((item, index) => {
              const Icon = item.icon;
              return (
                <div key={index} className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-violet-100 text-violet-600 rounded-lg flex items-center justify-center flex-shrink-0"><Icon className="w-5 h-5" /></div>
                    <div><h3 className="font-semibold text-gray-900 mb-1">{item.title}</h3><p className="text-sm text-gray-600 leading-relaxed">{item.description}</p></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <h3 className="font-semibold text-gray-900 mb-3">Seus Direitos (LGPD)</h3>
          <ul className="space-y-2">
            {yourRights.map((right, index) => (
              <li key={index} className="text-sm text-gray-600 flex items-start gap-2"><Shield className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" /><span>{right}</span></li>
            ))}
          </ul>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 bg-orange-100 text-orange-600 rounded-lg flex items-center justify-center flex-shrink-0"><Trash2 className="w-5 h-5" /></div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">Retenção de Dados</h3>
              <ul className="space-y-1 text-sm text-gray-600">
                <li>• Dados de conta: enquanto sua conta estiver ativa</li>
                <li>• Histórico de transações: 5 anos (obrigação legal)</li>
                <li>• Dados de marketing: até você revogar o consentimento</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
          <h3 className="font-semibold text-purple-900 mb-2">Encarregado de Dados (DPO)</h3>
          <div className="space-y-1 text-sm text-purple-800"><p><strong>E-mail:</strong> privacidade@joggahub.com</p><p><strong>Telefone:</strong> (11) 4002-8922</p></div>
        </div>

        <div className="space-y-3">
          <button onClick={() => navigate('/settings')} className="w-full bg-violet-600 text-white py-3 rounded-xl font-semibold hover:bg-violet-700 transition-colors">Gerenciar Preferências de Privacidade</button>
          <button onClick={() => navigate('/help')} className="w-full bg-white text-gray-700 py-3 rounded-xl font-semibold border-2 border-gray-200 hover:bg-gray-50 transition-colors">Falar com o DPO</button>
        </div>
      </div>
    </div>
  );
}
