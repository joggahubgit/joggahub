import { useNavigate } from 'react-router-dom';
import { MapPin, Users, Trophy } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import LanguageSelector from './LanguageSelector';

export default function Landing() {
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-600 to-violet-800 text-white">
      {/* Header */}
      <div className="px-6 py-8">
        <div className="flex justify-end mb-4">
          <LanguageSelector />
        </div>
        <div className="text-center">
          <div className="inline-block bg-white/10 backdrop-blur-sm rounded-full p-4 mb-4">
            <img src="/logo.png" alt="JoggaHub" className="w-16 h-16 object-contain" style={{ filter: 'brightness(0) invert(1)' }} />
          </div>
          <h1 className="text-4xl font-bold mb-2">{t('landing.title')}</h1>
          <p className="text-lg text-violet-100">{t('landing.slogan')}</p>
        </div>
      </div>

      {/* Hero Image */}
      <div className="px-6 mb-8">
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl overflow-hidden">
          <img
            src="https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=800&q=80"
            alt="Soccer players"
            className="w-full h-64 object-cover"
          />
        </div>
      </div>

      {/* Main CTAs */}
      <div className="px-6 space-y-4 mb-12">
        <button
          onClick={() => navigate('/find-games')}
          className="w-full bg-white text-violet-600 py-4 rounded-xl font-semibold text-lg shadow-lg hover:bg-violet-50 transition-colors"
        >
          ⚽ {t('landing.findGame')}
        </button>
        <button
          onClick={() => navigate('/find-courts')}
          className="w-full bg-violet-500 text-white py-4 rounded-xl font-semibold text-lg border-2 border-white/30 hover:bg-violet-400 transition-colors"
        >
          🏟️ {t('landing.bookCourt')}
        </button>
      </div>

      {/* Features */}
      <div className="px-6 pb-12 space-y-4">
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 flex items-center gap-4">
          <div className="bg-white/20 rounded-full p-3">
            <MapPin className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold">{t('landing.nearCourts')}</h3>
            <p className="text-sm text-violet-100">{t('landing.nearCourtsDesc')}</p>
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 flex items-center gap-4">
          <div className="bg-white/20 rounded-full p-3">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold">{t('landing.activeCommunity')}</h3>
            <p className="text-sm text-violet-100">{t('landing.activeCommunityDesc')}</p>
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 flex items-center gap-4">
          <div className="bg-white/20 rounded-full p-3">
            <Trophy className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold">{t('landing.competitions')}</h3>
            <p className="text-sm text-violet-100">{t('landing.competitionsDesc')}</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 pb-8 text-center">
        <button
          onClick={() => navigate('/auth')}
          className="text-violet-100 underline"
        >
          {t('landing.haveAccount')}
        </button>
      </div>
    </div>
  );
}
