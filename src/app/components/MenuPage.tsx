import { useNavigate } from 'react-router-dom';
import { ArrowLeft, User, CreditCard, Settings, HelpCircle, FileText, Shield, ChevronRight, Calendar } from 'lucide-react';
import { useAuth } from '@/app/contexts/AuthContext';

export default function MenuPage() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();

  const menuItems = [
    { icon: Calendar, label: 'Minhas Reservas', description: 'Histórico e gestão de reservas', onClick: () => navigate('/my-bookings'), color: 'blue' },
    { icon: CreditCard, label: 'Pagamentos', description: 'Métodos de pagamento e histórico', onClick: () => navigate('/payments'), color: 'purple' },
    { icon: Settings, label: 'Configurações', description: 'Preferências do app', onClick: () => navigate('/settings'), color: 'gray' },
    { icon: HelpCircle, label: 'Ajuda', description: 'Central de ajuda e suporte', onClick: () => navigate('/help'), color: 'orange' },
    { icon: FileText, label: 'Termos de uso', description: 'Leia nossos termos', onClick: () => navigate('/terms'), color: 'gray' },
    { icon: Shield, label: 'Política de privacidade', description: 'Como protegemos seus dados', onClick: () => navigate('/privacy'), color: 'gray' }
  ];

  const getColorClasses = (color: string) => {
    const colors: Record<string, string> = { blue: 'bg-violet-100 text-violet-600', green: 'bg-green-100 text-green-600', purple: 'bg-purple-100 text-purple-600', orange: 'bg-orange-100 text-orange-600', gray: 'bg-gray-100 text-gray-600' };
    return colors[color] || colors.gray;
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="px-6 py-4">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="text-gray-600 hover:text-gray-900"><ArrowLeft className="w-6 h-6" /></button>
            <h1 className="text-xl font-bold text-gray-900">Menu</h1>
          </div>
        </div>
      </div>

      <div className="px-6 py-6">
        <div className="bg-gradient-to-br from-violet-600 to-violet-700 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm"><User className="w-8 h-8" /></div>
            <div>
              <h2 className="text-xl font-bold">{profile?.name ?? 'Jogador'}</h2>
              <p className="text-sm text-violet-100">jogador@joggahub.com</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 pb-6">
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {menuItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <button key={index} onClick={item.onClick} className={`w-full flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors ${index !== menuItems.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${getColorClasses(item.color)}`}><Icon className="w-6 h-6" /></div>
                <div className="flex-1 text-left"><div className="font-semibold text-gray-900">{item.label}</div><div className="text-sm text-gray-500">{item.description}</div></div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-6 pb-6">
        <button onClick={handleSignOut} className="w-full bg-red-50 text-red-600 py-4 rounded-xl font-semibold hover:bg-red-100 transition-colors">Sair da conta</button>
      </div>

      <div className="px-6 pb-6 text-center"><p className="text-sm text-gray-400">JoggaHub v1.0.0</p></div>
    </div>
  );
}
