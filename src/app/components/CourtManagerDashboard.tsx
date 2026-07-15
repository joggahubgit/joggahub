import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, Users, Calendar, DollarSign, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import ComingSoonBanner from './ComingSoonBanner';

export default function CourtManagerDashboard() {
  const navigate = useNavigate();
  const [selectedView, setSelectedView] = useState<'overview' | 'groups'>('overview');

  const dashboardData = {
    totalRecurringRevenue: 4320,
    activeGroups: 3,
    totalSubscribers: 28,
    groupsBelowMinimum: 1,
    monthlyProjection: 4320
  };

  const subscriptionGroups = [
    { id: 1, name: 'Racha Fixo - Terça 19h', dayOfWeek: 'Terça-feira', time: '19:00', status: 'active', currentMembers: 10, maxMembers: 10, minMembers: 8, monthlyRevenue: 1440, courtPrice: 120 },
    { id: 2, name: 'Grupo Quinta 20h', dayOfWeek: 'Quinta-feira', time: '20:00', status: 'active', currentMembers: 12, maxMembers: 12, minMembers: 10, monthlyRevenue: 1920, courtPrice: 160 },
    { id: 3, name: 'Racha Sábado 10h', dayOfWeek: 'Sábado', time: '10:00', status: 'awaiting_minimum', currentMembers: 6, maxMembers: 10, minMembers: 8, monthlyRevenue: 960, courtPrice: 120 }
  ];

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'active': return { label: 'Ativo', color: 'text-green-700', bgColor: 'bg-green-50', borderColor: 'border-green-200', icon: <CheckCircle className="w-4 h-4" /> };
      case 'awaiting_minimum': return { label: 'Aguardando mínimo', color: 'text-yellow-700', bgColor: 'bg-yellow-50', borderColor: 'border-yellow-200', icon: <AlertCircle className="w-4 h-4" /> };
      case 'suspended': return { label: 'Suspenso', color: 'text-red-700', bgColor: 'bg-red-50', borderColor: 'border-red-200', icon: <XCircle className="w-4 h-4" /> };
      default: return { label: 'Desconhecido', color: 'text-gray-700', bgColor: 'bg-gray-50', borderColor: 'border-gray-200', icon: <AlertCircle className="w-4 h-4" /> };
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white pb-20">
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-6 py-6">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 mb-4"><ArrowLeft className="w-5 h-5" /><span>Voltar</span></button>
        <h1 className="text-2xl font-bold mb-2">Dashboard de Grupos Fixos</h1>
        <p className="text-purple-100">Arena Sports Center</p>
      </div>
      <ComingSoonBanner />

      <div className="px-6 py-4">
        <div className="bg-white rounded-xl p-1 shadow-sm inline-flex">
          <button onClick={() => setSelectedView('overview')} className={`px-6 py-2 rounded-lg font-semibold transition-all ${selectedView === 'overview' ? 'bg-purple-600 text-white' : 'text-gray-600 hover:text-gray-900'}`}>Visão Geral</button>
          <button onClick={() => setSelectedView('groups')} className={`px-6 py-2 rounded-lg font-semibold transition-all ${selectedView === 'groups' ? 'bg-purple-600 text-white' : 'text-gray-600 hover:text-gray-900'}`}>Grupos ({subscriptionGroups.length})</button>
        </div>
      </div>

      {selectedView === 'overview' && (
        <div className="px-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-2xl p-6 text-white shadow-lg">
              <div className="flex items-center gap-2 mb-2"><TrendingUp className="w-5 h-5" /><span className="text-sm text-green-100">Receita Recorrente</span></div>
              <div className="text-3xl font-bold mb-1">R$ {dashboardData.totalRecurringRevenue.toLocaleString()}</div>
              <div className="text-xs text-green-100">por mês</div>
            </div>
            <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-2xl p-6 text-white shadow-lg">
              <div className="flex items-center gap-2 mb-2"><Users className="w-5 h-5" /><span className="text-sm text-purple-100">Assinantes</span></div>
              <div className="text-3xl font-bold mb-1">{dashboardData.totalSubscribers}</div>
              <div className="text-xs text-purple-100">jogadores fixos</div>
            </div>
            <div className="bg-gradient-to-br from-violet-600 to-violet-700 rounded-2xl p-6 text-white shadow-lg">
              <div className="flex items-center gap-2 mb-2"><Calendar className="w-5 h-5" /><span className="text-sm text-violet-100">Grupos Ativos</span></div>
              <div className="text-3xl font-bold mb-1">{dashboardData.activeGroups}</div>
              <div className="text-xs text-violet-100">horários garantidos</div>
            </div>
            <div className="bg-gradient-to-br from-amber-600 to-amber-700 rounded-2xl p-6 text-white shadow-lg">
              <div className="flex items-center gap-2 mb-2"><AlertCircle className="w-5 h-5" /><span className="text-sm text-amber-100">Atenção</span></div>
              <div className="text-3xl font-bold mb-1">{dashboardData.groupsBelowMinimum}</div>
              <div className="text-xs text-amber-100">abaixo do mínimo</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2"><DollarSign className="w-5 h-5 text-purple-600" />Projeção Mensal</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-purple-50 rounded-lg"><span className="text-gray-700">Receita de grupos fixos</span><span className="font-bold text-purple-600">R$ {dashboardData.monthlyProjection}</span></div>
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg"><span className="text-gray-700">Reservas avulsas estimadas</span><span className="font-bold text-gray-600">R$ 2.400</span></div>
              <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg border-2 border-green-200"><span className="font-semibold text-gray-900">Total projetado</span><span className="text-2xl font-bold text-green-600">R$ {(dashboardData.monthlyProjection + 2400).toLocaleString()}</span></div>
            </div>
          </div>

          <div className="bg-violet-50 rounded-2xl p-6 border-2 border-violet-200">
            <h3 className="font-semibold text-violet-900 mb-3">Vantagens dos Grupos Fixos</h3>
            <ul className="space-y-2 text-sm text-violet-800">
              <li className="flex gap-2"><span>•</span><span><strong>Receita previsível:</strong> pagamentos recorrentes garantidos</span></li>
              <li className="flex gap-2"><span>•</span><span><strong>Taxa de ocupação:</strong> horários garantidos toda semana</span></li>
              <li className="flex gap-2"><span>•</span><span><strong>Menos gestão:</strong> jogadores se organizam automaticamente</span></li>
              <li className="flex gap-2"><span>•</span><span><strong>Comunidade fiel:</strong> jogadores regulares e engajados</span></li>
            </ul>
          </div>
        </div>
      )}

      {selectedView === 'groups' && (
        <div className="px-6 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-gray-900">Grupos de Assinatura</h2>
            <button className="text-purple-600 text-sm font-semibold">+ Criar novo</button>
          </div>

          {subscriptionGroups.map((group) => {
            const statusConfig = getStatusConfig(group.status);
            const fillPercentage = (group.currentMembers / group.maxMembers) * 100;
            return (
              <div key={group.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className={`${statusConfig.bgColor} border-b-2 ${statusConfig.borderColor} px-4 py-3 flex items-center justify-between`}>
                  <div className={`flex items-center gap-2 ${statusConfig.color}`}>{statusConfig.icon}<span className="font-semibold text-sm">{statusConfig.label}</span></div>
                  <span className={`text-xs font-medium ${statusConfig.color}`}>{group.currentMembers}/{group.maxMembers} jogadores</span>
                </div>
                <div className="p-6">
                  <h3 className="font-bold text-gray-900 mb-3">{group.name}</h3>
                  <div className="space-y-2 mb-4 text-sm text-gray-600">
                    <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-purple-600" /><span>{group.dayOfWeek}s às {group.time}</span></div>
                    <div className="flex items-center gap-2"><DollarSign className="w-4 h-4 text-purple-600" /><span>R$ {group.courtPrice}/hora • R$ {group.monthlyRevenue}/mês</span></div>
                  </div>
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2 text-xs"><span className="text-gray-500">Ocupação</span><span className="font-semibold text-gray-700">{Math.round(fillPercentage)}%</span></div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-purple-600 to-purple-700 transition-all" style={{ width: `${fillPercentage}%` }} /></div>
                    <div className="flex items-center justify-between mt-1 text-xs text-gray-500"><span>Mín: {group.minMembers}</span><span>Máx: {group.maxMembers}</span></div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-3 mb-4"><div className="text-xs text-purple-700 mb-1">Receita mensal</div><div className="text-2xl font-bold text-purple-600">R$ {group.monthlyRevenue}</div></div>
                  <div className="flex gap-2">
                    <button className="flex-1 bg-purple-100 text-purple-700 py-2 rounded-lg text-sm font-semibold hover:bg-purple-200 transition-colors">Ver detalhes</button>
                    <button className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg text-sm font-semibold hover:bg-gray-200 transition-colors">Gerenciar</button>
                  </div>
                </div>
              </div>
            );
          })}

          <div className="bg-white rounded-2xl p-6 shadow-sm border-2 border-dashed border-purple-300 text-center">
            <div className="bg-purple-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"><Calendar className="w-6 h-6 text-purple-600" /></div>
            <h3 className="font-semibold text-gray-900 mb-2">Criar novo grupo fixo</h3>
            <p className="text-sm text-gray-600 mb-4">Aumente sua receita recorrente com mais grupos de assinatura</p>
            <button className="bg-purple-600 text-white px-6 py-2 rounded-xl font-semibold hover:bg-purple-700 transition-colors">Começar agora</button>
          </div>
        </div>
      )}
    </div>
  );
}
