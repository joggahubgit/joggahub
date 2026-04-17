import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, Globe, Lock, ChevronRight } from 'lucide-react';

export default function SettingsPage() {
  const navigate = useNavigate();

  const [settings, setSettings] = useState({
    notifications: { gameReminders: true, newMessages: true, playerJoined: true, gameCanceled: true, promotions: false },
    privacy: { profileVisible: true, showStats: true, showLocation: true }
  });

  const toggleNotification = (key: keyof typeof settings.notifications) => {
    setSettings({ ...settings, notifications: { ...settings.notifications, [key]: !settings.notifications[key] } });
  };

  const togglePrivacy = (key: keyof typeof settings.privacy) => {
    setSettings({ ...settings, privacy: { ...settings.privacy, [key]: !settings.privacy[key] } });
  };

  const Toggle = ({ value, onToggle }: { value: boolean; onToggle: () => void }) => (
    <button onClick={onToggle} className={`w-12 h-7 rounded-full transition-colors ${value ? 'bg-violet-600' : 'bg-gray-300'}`}>
      <div className={`w-5 h-5 bg-white rounded-full shadow-md transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-6">
      <div className="bg-white border-b border-gray-200">
        <div className="px-6 py-4">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="text-gray-600 hover:text-gray-900"><ArrowLeft className="w-6 h-6" /></button>
            <h1 className="text-xl font-bold text-gray-900">Configurações</h1>
          </div>
        </div>
      </div>

      <div className="px-6 py-6 space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-3 px-2"><Bell className="w-5 h-5 text-gray-600" /><h2 className="font-semibold text-gray-900">Notificações</h2></div>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {[
              { key: 'gameReminders' as const, label: 'Lembretes de jogos', sub: 'Receba notificações antes dos jogos' },
              { key: 'newMessages' as const, label: 'Novas mensagens', sub: 'Notificações de chat' },
              { key: 'playerJoined' as const, label: 'Jogador entrou', sub: 'Quando alguém entrar no seu jogo' },
              { key: 'gameCanceled' as const, label: 'Jogo cancelado', sub: 'Avisos de cancelamento' },
              { key: 'promotions' as const, label: 'Promoções e novidades', sub: 'Ofertas especiais e atualizações' }
            ].map((item, idx, arr) => (
              <div key={item.key} className={`p-4 ${idx < arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <div className="flex items-center justify-between">
                  <div className="flex-1"><h3 className="font-semibold text-gray-900">{item.label}</h3><p className="text-sm text-gray-500">{item.sub}</p></div>
                  <Toggle value={settings.notifications[item.key]} onToggle={() => toggleNotification(item.key)} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-3 px-2"><Lock className="w-5 h-5 text-gray-600" /><h2 className="font-semibold text-gray-900">Privacidade</h2></div>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {[
              { key: 'profileVisible' as const, label: 'Perfil visível', sub: 'Outros jogadores podem ver seu perfil' },
              { key: 'showStats' as const, label: 'Mostrar estatísticas', sub: 'Exibir suas estatísticas de jogo' },
              { key: 'showLocation' as const, label: 'Mostrar localização', sub: 'Compartilhar sua cidade' }
            ].map((item, idx, arr) => (
              <div key={item.key} className={`p-4 ${idx < arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <div className="flex items-center justify-between">
                  <div className="flex-1"><h3 className="font-semibold text-gray-900">{item.label}</h3><p className="text-sm text-gray-500">{item.sub}</p></div>
                  <Toggle value={settings.privacy[item.key]} onToggle={() => togglePrivacy(item.key)} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-3 px-2"><Globe className="w-5 h-5 text-gray-600" /><h2 className="font-semibold text-gray-900">Preferências</h2></div>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <button className="w-full p-4 border-b border-gray-100 flex items-center justify-between hover:bg-gray-50">
              <div className="flex-1 text-left"><h3 className="font-semibold text-gray-900">Idioma</h3><p className="text-sm text-gray-500">Português (Brasil)</p></div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </button>
            <button className="w-full p-4 border-b border-gray-100 flex items-center justify-between hover:bg-gray-50">
              <div className="flex-1 text-left"><h3 className="font-semibold text-gray-900">Esporte padrão</h3><p className="text-sm text-gray-500">Futebol</p></div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </button>
            <button className="w-full p-4 flex items-center justify-between hover:bg-gray-50">
              <div className="flex-1 text-left"><h3 className="font-semibold text-gray-900">Localização padrão</h3><p className="text-sm text-gray-500">São Paulo, SP</p></div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <button className="w-full p-4 border-b border-gray-100 flex items-center justify-between hover:bg-gray-50"><h3 className="font-semibold text-gray-900">Alterar senha</h3><ChevronRight className="w-5 h-5 text-gray-400" /></button>
          <button className="w-full p-4 flex items-center justify-between hover:bg-gray-50"><h3 className="font-semibold text-red-600">Excluir conta</h3><ChevronRight className="w-5 h-5 text-gray-400" /></button>
        </div>
      </div>
    </div>
  );
}
