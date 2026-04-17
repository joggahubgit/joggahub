import { Globe } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useState } from 'react';

export default function LanguageSelector() {
  const { language, setLanguage } = useLanguage();
  const [showMenu, setShowMenu] = useState(false);

  const languages = [
    { code: 'pt-BR' as const, name: 'Português', flag: '🇧🇷' },
    { code: 'en' as const, name: 'English', flag: '🇺🇸' },
  ];

  const currentLang = languages.find(l => l.code === language);

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="flex items-center gap-2 bg-white/20 backdrop-blur-sm text-white px-3 py-2 rounded-lg hover:bg-white/30 transition-colors"
      >
        <Globe className="w-4 h-4" />
        <span className="text-sm">{currentLang?.flag}</span>
      </button>

      {showMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
          <div className="absolute right-0 top-12 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden z-50 min-w-[160px]">
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => { setLanguage(lang.code); setShowMenu(false); }}
                className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors ${language === lang.code ? 'bg-violet-50' : ''}`}
              >
                <span className="text-xl">{lang.flag}</span>
                <span className={`font-medium ${language === lang.code ? 'text-violet-600' : 'text-gray-700'}`}>
                  {lang.name}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
