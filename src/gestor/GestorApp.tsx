import { useState, useEffect } from 'react';
import { LayoutDashboard, Calendar, List, DollarSign, Settings, LogOut, Menu, X, Building2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { LoginPage } from './components/LoginPage';
import { SimpleDashboard } from './components/SimpleDashboard';
import { SmartBookingCalendar } from './components/SmartBookingCalendar';
import { SimpleBookingsList } from './components/SimpleBookingsList';
import { SimpleRevenue } from './components/SimpleRevenue';
import { SimpleSettings } from './components/SimpleSettings';
import { CreateAvailability } from './components/CreateAvailability';
import { VenueProfile } from './components/VenueProfile';

type Tab = 'dashboard' | 'calendar' | 'bookings' | 'revenue' | 'profile' | 'settings';

export default function GestorApp() {
  const [user, setUser] = useState<any>(null);
  const [venue, setVenue] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showCreateAvailability, setShowCreateAvailability] = useState(false);
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) loadVenue(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) loadVenue(session.user.id);
      else { setVenue(null); setLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadVenue(userId: string) {
    const { data } = await supabase.from('venues').select('*').eq('admin_id', userId).single();
    setVenue(data ?? null);
    setLoading(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500 text-lg">Carregando...</div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  // No venue registered yet — force settings tab
  if (!venue && activeTab !== 'settings') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-purple-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Configure sua quadra</h2>
          <p className="text-gray-600 mb-6">Antes de continuar, cadastre as informações da sua quadra.</p>
          <button
            onClick={() => setActiveTab('settings')}
            className="w-full bg-purple-600 text-white py-3 rounded-xl font-semibold hover:bg-purple-700 transition-colors"
          >
            Ir para Configurações
          </button>
        </div>
      </div>
    );
  }

  const menuItems = [
    { id: 'dashboard' as Tab, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'calendar' as Tab, label: 'Agenda', icon: Calendar },
    { id: 'bookings' as Tab, label: 'Reservas', icon: List },
    { id: 'revenue' as Tab, label: 'Pagamentos', icon: DollarSign },
    { id: 'profile' as Tab, label: 'Perfil da Quadra', icon: Building2 },
    { id: 'settings' as Tab, label: 'Configurações', icon: Settings },
  ];

  const venueInitials = (venue?.name ?? 'JH').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <SimpleDashboard venueId={venue?.id} onCreateAvailability={() => setShowCreateAvailability(true)} onNavigate={(tab) => setActiveTab(tab as Tab)} />;
      case 'calendar':
        return <SmartBookingCalendar key={calendarRefreshKey} venueId={venue?.id} />;
      case 'bookings':
        return <SimpleBookingsList venueId={venue?.id} />;
      case 'revenue':
        return <SimpleRevenue venueId={venue?.id} />;
      case 'profile':
        return <VenueProfile venue={venue} onVenueUpdated={setVenue} />;
      case 'settings':
        return <SimpleSettings venueId={venue?.id} userId={user?.id} onVenueCreated={(v) => { setVenue(v); setActiveTab('dashboard'); }} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b-2 border-gray-100 sticky top-0 z-40 shadow-sm">
        <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center gap-2 md:gap-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 md:w-10 md:h-10 bg-purple-600 rounded-xl flex items-center justify-center shadow-md">
                <span className="text-white font-bold text-sm">JH</span>
              </div>
              <div>
                <h1 className="font-bold text-lg md:text-xl text-gray-900">JoggaHub</h1>
                <p className="text-xs text-gray-600 hidden md:block">Gestor de Quadras</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            <div className="hidden md:flex flex-col items-end">
              <span className="text-sm font-medium text-gray-900">{venue?.name ?? 'Minha Quadra'}</span>
              <span className="text-xs text-gray-600">Administrador</span>
            </div>
            <div className="w-9 h-9 md:w-10 md:h-10 bg-gradient-to-br from-purple-600 to-purple-700 rounded-full flex items-center justify-center text-white font-semibold shadow-md text-sm md:text-base">
              {venueInitials}
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className={`
          fixed lg:sticky top-[57px] md:top-[73px] left-0 h-[calc(100vh-57px)] md:h-[calc(100vh-73px)] bg-white border-r-2 border-gray-100 z-30
          w-64 transition-transform duration-300 ease-in-out shadow-lg lg:shadow-none
          ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}>
          <nav className="p-3 md:p-4 space-y-1 md:space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => { setActiveTab(item.id); setMobileMenuOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 md:px-4 py-2.5 md:py-3 rounded-xl transition-all text-sm md:text-base ${
                    activeTab === item.id
                      ? 'bg-purple-600 text-white font-semibold shadow-md'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="absolute bottom-0 left-0 right-0 p-3 md:p-4 border-t-2 border-gray-100">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-3 md:px-4 py-2.5 md:py-3 rounded-xl text-red-600 hover:bg-red-50 transition-colors text-sm md:text-base"
            >
              <LogOut className="w-5 h-5" />
              <span>Sair</span>
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 min-w-0">
          <div className="max-w-7xl mx-auto">
            {renderContent()}
          </div>
        </main>
      </div>

      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Create Availability Modal */}
      {showCreateAvailability && venue?.id && (
        <CreateAvailability
          venueId={venue.id}
          onClose={() => setShowCreateAvailability(false)}
          onSaved={() => { setCalendarRefreshKey(k => k + 1); setShowCreateAvailability(false); }}
        />
      )}
    </div>
  );
}
