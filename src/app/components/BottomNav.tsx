import { useLocation, useNavigate } from 'react-router-dom';
import { Home as HomeIcon, Users, User } from 'lucide-react';

/**
 * Shared Início/Comunidade/Perfil tab bar — mounted once wherever a page needs
 * it (instead of each page re-declaring its own copy), with the active tab
 * derived from the current route instead of local per-page state.
 */
export default function BottomNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const isHome = pathname === '/home';
  const isCommunity = pathname.startsWith('/community');
  const isProfile = pathname.startsWith('/profile') || pathname.startsWith('/player');

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-3 max-w-md mx-auto z-40">
      <div className="flex items-center justify-around">
        <button onClick={() => navigate('/home')} className={`flex flex-col items-center gap-1 ${isHome ? 'text-violet-600' : 'text-gray-400'}`}>
          <HomeIcon className="w-6 h-6" /><span className="text-xs">Início</span>
        </button>
        <button onClick={() => navigate('/community')} className={`flex flex-col items-center gap-1 ${isCommunity ? 'text-violet-600' : 'text-gray-400'}`}>
          <Users className="w-6 h-6" /><span className="text-xs">Comunidade</span>
        </button>
        <button onClick={() => navigate('/profile')} className={`flex flex-col items-center gap-1 ${isProfile ? 'text-violet-600' : 'text-gray-400'}`}>
          <User className="w-6 h-6" /><span className="text-xs">Perfil</span>
        </button>
      </div>
    </div>
  );
}
