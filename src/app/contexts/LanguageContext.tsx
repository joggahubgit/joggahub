import { createContext, useContext, useState, ReactNode } from 'react';

type Language = 'pt-BR' | 'en';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('joggahub_language');
    return (saved as Language) || 'pt-BR';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('joggahub_language', lang);
  };

  const t = (key: string): string => {
    const keys = key.split('.');
    let value: any = translations[language];
    for (const k of keys) {
      value = value?.[k];
    }
    return value || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within LanguageProvider');
  return context;
}

const translations = {
  'pt-BR': {
    common: {
      back: 'Voltar',
      continue: 'Continuar',
      cancel: 'Cancelar',
      confirm: 'Confirmar',
      save: 'Salvar',
      search: 'Buscar',
      filter: 'Filtros',
      viewAll: 'Ver todos',
      close: 'Fechar',
      share: 'Compartilhar',
    },
    landing: {
      title: 'JoggaHub',
      slogan: 'Onde a comunidade joga',
      findGame: 'Encontrar jogo',
      bookCourt: 'Reservar quadra',
      nearCourts: 'Quadras perto de você',
      nearCourtsDesc: 'Mais de 500 quadras disponíveis',
      activeCommunity: 'Comunidade ativa',
      activeCommunityDesc: 'Conecte-se com jogadores',
      competitions: 'Competições',
      competitionsDesc: 'Participe de campeonatos',
      haveAccount: 'Já tem uma conta? Entrar',
    },
    home: {
      hello: 'Olá',
      searchPlaceholder: 'Buscar quadras, jogos...',
      explore: 'Explorar',
      findCourts: 'Encontrar',
      courts: 'Quadras',
      classes: 'Aulas',
      learn: 'Aprenda',
      competitions: 'Competições',
      participate: 'Participe',
      findMatch: 'Encontre',
      match: 'uma partida',
      recommendedGames: 'Jogos recomendados para você',
      mostPlayedCourts: 'Quadras que você mais joga',
      playersYourLevel: 'Jogadores no seu nível',
      home: 'Início',
      community: 'Comunidade',
      profile: 'Perfil',
    },
  },
  'en': {
    common: {
      back: 'Back',
      continue: 'Continue',
      cancel: 'Cancel',
      confirm: 'Confirm',
      save: 'Save',
      search: 'Search',
      filter: 'Filters',
      viewAll: 'View all',
      close: 'Close',
      share: 'Share',
    },
    landing: {
      title: 'JoggaHub',
      slogan: 'Where the community plays',
      findGame: 'Find game',
      bookCourt: 'Book court',
      nearCourts: 'Courts near you',
      nearCourtsDesc: 'Over 500 courts available',
      activeCommunity: 'Active community',
      activeCommunityDesc: 'Connect with players',
      competitions: 'Competitions',
      competitionsDesc: 'Join tournaments',
      haveAccount: 'Already have an account? Sign in',
    },
    home: {
      hello: 'Hello',
      searchPlaceholder: 'Search courts, games...',
      explore: 'Explore',
      findCourts: 'Find',
      courts: 'Courts',
      classes: 'Classes',
      learn: 'Learn',
      competitions: 'Competitions',
      participate: 'Join',
      findMatch: 'Find',
      match: 'a match',
      recommendedGames: 'Recommended games for you',
      mostPlayedCourts: 'Your most played courts',
      playersYourLevel: 'Players at your level',
      home: 'Home',
      community: 'Community',
      profile: 'Profile',
    },
  },
};
