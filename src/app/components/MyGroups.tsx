import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Calendar, Users, AlertCircle, CheckCircle, Clock } from 'lucide-react';

export default function MyGroups() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'active' | 'past'>('active');

  const activeGroups = [
    { id: 1, name: 'Racha das Quartas', courtName: 'Arena Sports Center', dayOfWeek: 'Quarta-feira', time: '19:00', players: 10, confirmedThisWeek: 8, paidThisWeek: 7, nextGame: '2026-02-18', pricePerPlayer: 12, status: 'active' },
    { id: 2, name: 'Pelada da Sexta', courtName: 'Soccer Park', dayOfWeek: 'Sexta-feira', time: '20:00', players: 12, confirmedThisWeek: 12, paidThisWeek: 12, nextGame: '2026-02-20', pricePerPlayer: 15, status: 'confirmed' }
  ];

  const getStatusColor = (confirmed: number, total: number) => {
    const pct = (confirmed / total) * 100;
    if (pct === 100) return 'bg-green-100 text-green-700 border-green-200';
    if (pct >= 80) return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    return 'bg-red-100 text-red-700 border-red-200';
  };

  const getStatusIcon = (confirmed: number, total: number) => {
    const pct = (confirmed / total) * 100;
    if (pct === 100) return <CheckCircle className="w-5 h-5" />;
    if (pct >= 80) return <Clock className="w-5 h-5" />;
    return <AlertCircle className="w-5 h-5" />;
  };

  const getStatusText = (confirmed: number, total: number) => {
    const pct = (confirmed / total) * 100;
    if (pct === 100) return 'Confirmado';
    if (pct >= 80) return 'Quase lá';
    return 'Atenção';
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white pb-20">
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-6 py-6">
        <button onClick={() => navigate('/home')} className="flex items-center gap-2 mb-4"><ArrowLeft className="w-5 h-5" /><span>Voltar</span></button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-2">Meus Grupos</h1>
            <p className="text-purple-100">Gerencie suas reservas recorrentes</p>
          </div>
          <button onClick={() => navigate('/find-courts')} className="bg-white/20 backdrop-blur-sm p-3 rounded-full hover:bg-white/30 transition-colors"><Plus className="w-6 h-6" /></button>
        </div>
      </div>

      <div className="px-6 py-4">
        <div className="bg-white rounded-xl p-1 shadow-sm inline-flex">
          <button onClick={() => setActiveTab('active')} className={`px-6 py-2 rounded-lg font-semibold transition-all ${activeTab === 'active' ? 'bg-purple-600 text-white' : 'text-gray-600 hover:text-gray-900'}`}>Ativos ({activeGroups.length})</button>
          <button onClick={() => setActiveTab('past')} className={`px-6 py-2 rounded-lg font-semibold transition-all ${activeTab === 'past' ? 'bg-purple-600 text-white' : 'text-gray-600 hover:text-gray-900'}`}>Finalizados (0)</button>
        </div>
      </div>

      <div className="px-6 space-y-4">
        {activeGroups.length === 0 ? (
          <div className="text-center py-12">
            <div className="bg-purple-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"><Users className="w-8 h-8 text-purple-600" /></div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Nenhum grupo ainda</h3>
            <p className="text-gray-600 mb-6">Crie seu primeiro grupo recorrente</p>
            <button onClick={() => navigate('/find-courts')} className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-6 py-3 rounded-xl font-semibold">Criar grupo</button>
          </div>
        ) : (
          activeGroups.map((group) => (
            <div key={group.id} onClick={() => navigate(`/group-details/${group.id}`, { state: group })} className="bg-white rounded-2xl shadow-sm overflow-hidden hover:shadow-md transition-shadow cursor-pointer">
              <div className={`px-4 py-2 flex items-center justify-between ${getStatusColor(group.confirmedThisWeek, group.players)}`}>
                <div className="flex items-center gap-2">{getStatusIcon(group.confirmedThisWeek, group.players)}<span className="font-semibold">{getStatusText(group.confirmedThisWeek, group.players)}</span></div>
                <span className="text-sm font-medium">{group.confirmedThisWeek}/{group.players} confirmados</span>
              </div>
              <div className="p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-3">{group.name}</h3>
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-gray-600"><Calendar className="w-4 h-4 text-purple-600" /><span className="text-sm">{group.dayOfWeek}s às {group.time}</span></div>
                  <div className="flex items-center gap-2 text-gray-600"><Users className="w-4 h-4 text-purple-600" /><span className="text-sm">{group.courtName}</span></div>
                </div>
                <div className="bg-purple-50 rounded-xl p-4 mb-4">
                  <div className="text-sm text-purple-900 font-semibold mb-3">Próximo jogo: {new Date(group.nextGame).toLocaleDateString('pt-BR')}</div>
                  <div className="grid grid-cols-3 gap-3">
                    <div><div className="text-xs text-purple-600 mb-1">Confirmados</div><div className="text-lg font-bold text-purple-900">{group.confirmedThisWeek}/{group.players}</div></div>
                    <div><div className="text-xs text-purple-600 mb-1">Pagos</div><div className="text-lg font-bold text-purple-900">{group.paidThisWeek}/{group.players}</div></div>
                    <div><div className="text-xs text-purple-600 mb-1">Vagas</div><div className="text-lg font-bold text-purple-900">{group.players - group.confirmedThisWeek}</div></div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button className="bg-purple-600 text-white py-2 rounded-lg font-semibold text-sm hover:bg-purple-700 transition-colors">Gerenciar</button>
                  <button className="bg-purple-100 text-purple-700 py-2 rounded-lg font-semibold text-sm hover:bg-purple-200 transition-colors">Compartilhar</button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {activeGroups.length > 0 && (
        <div className="px-6 mt-6">
          <h2 className="font-semibold text-gray-900 mb-4">Resumo do mês</h2>
          <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-2xl p-6 text-white shadow-lg">
            <div className="grid grid-cols-3 gap-4">
              <div><div className="text-purple-200 text-sm mb-1">Grupos ativos</div><div className="text-3xl font-bold">{activeGroups.length}</div></div>
              <div><div className="text-purple-200 text-sm mb-1">Jogos/mês</div><div className="text-3xl font-bold">{activeGroups.length * 4}</div></div>
              <div><div className="text-purple-200 text-sm mb-1">Arrecadação</div><div className="text-3xl font-bold">R$ {activeGroups.reduce((sum, g) => sum + (g.pricePerPlayer * g.players * 4), 0)}</div></div>
            </div>
          </div>
        </div>
      )}

      <div className="px-6 mt-6 pb-6">
        <div className="bg-violet-50 rounded-2xl p-6 border-2 border-violet-200">
          <h3 className="font-semibold text-violet-900 mb-3">Dicas para organizadores</h3>
          <ul className="space-y-2 text-sm text-violet-800">
            <li className="flex gap-2"><span>•</span><span>Envie lembretes 2 dias antes do jogo</span></li>
            <li className="flex gap-2"><span>•</span><span>Abra vagas para substitutos se necessário</span></li>
            <li className="flex gap-2"><span>•</span><span>Mantenha o grupo ativo compartilhando no feed</span></li>
          </ul>
        </div>
      </div>
    </div>
  );
}
