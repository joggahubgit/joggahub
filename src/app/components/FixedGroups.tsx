import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Calendar, Users, TrendingUp, CheckCircle, AlertCircle, Clock, Settings, Bell } from 'lucide-react';
import ComingSoonBanner from './ComingSoonBanner';

export default function FixedGroups() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<'player' | 'manager'>('player');

  const myGroups = [
    { id: 1, name: 'Racha das Quartas', dayOfWeek: 'Quarta-feira', time: '19:00', status: 'active', isOrganizer: true, currentMembers: 10, maxMembers: 10, nextGame: '18/02/2026', needsConfirmation: true, monthlyPrice: 48 },
    { id: 2, name: 'Pelada da Sexta', dayOfWeek: 'Sexta-feira', time: '20:00', status: 'active', isOrganizer: false, currentMembers: 12, maxMembers: 12, nextGame: '20/02/2026', needsConfirmation: false, monthlyPrice: 60 }
  ];

  const availableGroups = [
    { id: 3, name: 'Grupo Terça Manhã', dayOfWeek: 'Terça-feira', time: '09:00', courtName: 'Arena Sports', currentMembers: 6, maxMembers: 10, minMembers: 8, monthlyPrice: 40 },
    { id: 4, name: 'Racha Sábado', dayOfWeek: 'Sábado', time: '10:00', courtName: 'Soccer Park', currentMembers: 9, maxMembers: 12, minMembers: 10, monthlyPrice: 55 }
  ];

  const isManager = true;

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white pb-20">
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-6 py-6">
        <div className="flex items-center justify-between mb-4">
          <div><h1 className="text-2xl font-bold mb-1">Grupos Fixos</h1><p className="text-purple-100 text-sm">Assinaturas e rachas semanais</p></div>
          <button onClick={() => navigate('/settings')} className="bg-white/20 backdrop-blur-sm p-2 rounded-lg hover:bg-white/30 transition-colors"><Settings className="w-5 h-5" /></button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3"><div className="text-2xl font-bold">{myGroups.length}</div><div className="text-xs text-purple-100">Meus grupos</div></div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3"><div className="text-2xl font-bold">{myGroups.filter(g => g.needsConfirmation).length}</div><div className="text-xs text-purple-100">Pendentes</div></div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3"><div className="text-2xl font-bold">R$ {myGroups.reduce((sum, g) => sum + g.monthlyPrice, 0)}</div><div className="text-xs text-purple-100">Mensais</div></div>
        </div>
      </div>
      <ComingSoonBanner />

      {isManager && (
        <div className="px-6 py-4">
          <div className="bg-white rounded-xl p-1 shadow-sm inline-flex">
            <button onClick={() => setActiveSection('player')} className={`px-6 py-2 rounded-lg font-semibold transition-all ${activeSection === 'player' ? 'bg-purple-600 text-white' : 'text-gray-600 hover:text-gray-900'}`}>Como Jogador</button>
            <button onClick={() => setActiveSection('manager')} className={`px-6 py-2 rounded-lg font-semibold transition-all ${activeSection === 'manager' ? 'bg-purple-600 text-white' : 'text-gray-600 hover:text-gray-900'}`}>Como Gestor</button>
          </div>
        </div>
      )}

      {activeSection === 'player' && (
        <div className="px-6 space-y-6">
          {myGroups.some(g => g.needsConfirmation) && (
            <div className="bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-3">
                <Bell className="w-6 h-6 text-yellow-600" />
                <div><h3 className="font-bold text-yellow-900">Confirmação pendente</h3><p className="text-sm text-yellow-700">Você tem jogos aguardando confirmação</p></div>
              </div>
              {myGroups.filter(g => g.needsConfirmation).map(group => (
                <button key={group.id} onClick={() => navigate('/weekly-confirmation')} className="w-full bg-yellow-600 text-white py-3 rounded-xl font-semibold hover:bg-yellow-700 transition-colors mt-3">
                  Confirmar presença - {group.name}
                </button>
              ))}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-semibold text-gray-900">Meus Grupos Ativos</h2><span className="text-sm text-gray-600">{myGroups.length} grupos</span></div>
            <div className="space-y-3">
              {myGroups.map((group) => (
                <div key={group.id} onClick={() => navigate('/subscription-group-details')} className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-all cursor-pointer">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-gray-900 mb-1">{group.name}</h3>
                      <div className="flex items-center gap-2 text-sm text-gray-600"><Calendar className="w-4 h-4" /><span>{group.dayOfWeek}s às {group.time}</span></div>
                    </div>
                    {group.isOrganizer && <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-xs font-semibold">Organizador</span>}
                  </div>
                  <div className="flex items-center gap-4 mb-3">
                    <div className="flex-1 bg-purple-50 rounded-lg p-3"><div className="text-xs text-purple-600 mb-1">Próximo jogo</div><div className="font-semibold text-purple-900">{group.nextGame}</div></div>
                    <div className="flex-1 bg-purple-50 rounded-lg p-3"><div className="text-xs text-purple-600 mb-1">Mensalidade</div><div className="font-semibold text-purple-900">R$ {group.monthlyPrice}</div></div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-gray-600"><Users className="w-4 h-4" /><span>{group.currentMembers}/{group.maxMembers} jogadores</span></div>
                    {group.needsConfirmation ? (
                      <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1"><Clock className="w-3 h-3" />Confirmar</span>
                    ) : (
                      <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1"><CheckCircle className="w-3 h-3" />Confirmado</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => navigate('/find-courts')} className="bg-gradient-to-r from-purple-600 to-purple-700 text-white p-6 rounded-2xl hover:from-purple-700 hover:to-purple-800 transition-all shadow-lg">
              <Plus className="w-8 h-8 mb-3" /><div className="font-bold text-lg mb-1">Criar Grupo</div><div className="text-xs text-purple-100">Seja organizador</div>
            </button>
            <button onClick={() => navigate('/subscription-player-join')} className="bg-white border-2 border-purple-300 text-purple-700 p-6 rounded-2xl hover:bg-purple-50 transition-all">
              <Users className="w-8 h-8 mb-3" /><div className="font-bold text-lg mb-1">Entrar</div><div className="text-xs text-purple-600">Em um grupo</div>
            </button>
          </div>

          <div>
            <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-semibold text-gray-900">Grupos Disponíveis</h2><button className="text-purple-600 text-sm font-semibold">Ver todos</button></div>
            <div className="space-y-3">
              {availableGroups.map((group) => (
                <div key={group.id} className="bg-white rounded-2xl p-6 shadow-sm border-2 border-purple-200">
                  <div className="flex items-start justify-between mb-3">
                    <div><h3 className="font-bold text-gray-900 mb-1">{group.name}</h3><div className="text-sm text-gray-600">{group.courtName}</div></div>
                    <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1"><AlertCircle className="w-3 h-3" />{group.maxMembers - group.currentMembers} vagas</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-4"><Calendar className="w-4 h-4" /><span>{group.dayOfWeek}s às {group.time}</span></div>
                  <div className="flex items-center justify-between">
                    <div className="text-2xl font-bold text-purple-600">R$ {group.monthlyPrice}</div>
                    <button onClick={() => navigate('/subscription-player-join')} className="bg-purple-600 text-white px-6 py-2 rounded-xl font-semibold hover:bg-purple-700 transition-colors">Entrar</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-violet-50 rounded-2xl p-6 border-2 border-violet-200">
            <h3 className="font-semibold text-violet-900 mb-3">Como funciona</h3>
            <ul className="space-y-2 text-sm text-violet-800">
              <li className="flex gap-2"><span>•</span><span>Escolha um grupo fixo ou crie o seu</span></li>
              <li className="flex gap-2"><span>•</span><span>Pague mensalidade e garanta seu horário toda semana</span></li>
              <li className="flex gap-2"><span>•</span><span>Confirme presença até 24h antes do jogo</span></li>
              <li className="flex gap-2"><span>•</span><span>Não pode ir? Indique um substituto sem custo</span></li>
            </ul>
          </div>
        </div>
      )}

      {activeSection === 'manager' && (
        <div className="px-6 space-y-6">
          <div className="bg-gradient-to-br from-violet-600 to-violet-700 rounded-2xl p-6 text-white shadow-lg">
            <h3 className="font-bold text-lg mb-4">Dashboard do Gestor</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4"><TrendingUp className="w-6 h-6 mb-2" /><div className="text-2xl font-bold mb-1">R$ 4.320</div><div className="text-xs text-violet-100">Receita mensal</div></div>
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4"><Users className="w-6 h-6 mb-2" /><div className="text-2xl font-bold mb-1">28</div><div className="text-xs text-violet-100">Assinantes</div></div>
            </div>
            <button onClick={() => navigate('/court-manager-dashboard')} className="w-full bg-white text-violet-600 py-3 rounded-xl font-semibold hover:bg-violet-50 transition-colors">Ver dashboard completo</button>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-4">Ações rápidas</h3>
            <div className="space-y-3">
              <button className="w-full bg-purple-100 text-purple-700 py-3 rounded-xl font-semibold hover:bg-purple-200 transition-colors text-left px-4">Criar novo grupo fixo</button>
              <button className="w-full bg-gray-100 text-gray-700 py-3 rounded-xl font-semibold hover:bg-gray-200 transition-colors text-left px-4">Gerenciar grupos existentes</button>
              <button className="w-full bg-gray-100 text-gray-700 py-3 rounded-xl font-semibold hover:bg-gray-200 transition-colors text-left px-4">Relatório de receita</button>
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-3 max-w-md mx-auto">
        <div className="flex items-center justify-around">
          <button onClick={() => navigate('/home')} className="flex flex-col items-center gap-1 text-gray-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
            <span className="text-xs">Início</span>
          </button>
          <button onClick={() => navigate('/community')} className="flex flex-col items-center gap-1 text-gray-400"><Users className="w-6 h-6" /><span className="text-xs">Comunidade</span></button>
          <button onClick={() => navigate('/fixed-groups')} className="flex flex-col items-center gap-1 text-purple-600"><Calendar className="w-6 h-6" /><span className="text-xs font-semibold">Grupo Fixo</span></button>
          <button onClick={() => navigate('/profile')} className="flex flex-col items-center gap-1 text-gray-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            <span className="text-xs">Perfil</span>
          </button>
        </div>
      </div>
    </div>
  );
}
