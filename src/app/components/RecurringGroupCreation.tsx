import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Upload, Copy, Share2, Check } from 'lucide-react';

export default function RecurringGroupCreation() {
  const navigate = useNavigate();
  const location = useLocation();
  const { courtName, courtPrice, selectedTime, dayOfWeek, startDate, endDate, numberOfPlayers, pricePerPlayer, weeks } = (location.state || {}) as Record<string, unknown>;

  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [copied, setCopied] = useState(false);

  const inviteLink = `joggahub.app/join/grupo-${Math.random().toString(36).substr(2, 9)}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreateGroup = () => {
    const groupData = {
      id: Math.random().toString(36).substr(2, 9),
      name: groupName,
      description,
      courtName,
      courtPrice,
      selectedTime,
      dayOfWeek,
      startDate,
      endDate,
      numberOfPlayers,
      pricePerPlayer,
      weeks,
      inviteLink,
      members: [
        { id: 1, name: 'Você (Organizador)', status: 'confirmed', isPaid: true, isOrganizer: true }
      ],
      createdAt: new Date().toISOString()
    };

    const existingGroups = JSON.parse(localStorage.getItem('recurring_groups') || '[]');
    existingGroups.push(groupData);
    localStorage.setItem('recurring_groups', JSON.stringify(existingGroups));

    navigate('/recurring-payment', { state: groupData });
  };

  const dayLabels: Record<string, string> = {
    monday: 'Segundas',
    tuesday: 'Terças',
    wednesday: 'Quartas',
    thursday: 'Quintas',
    friday: 'Sextas',
    saturday: 'Sábados',
    sunday: 'Domingos',
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white pb-24">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-6 py-6">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 mb-4">
          <ArrowLeft className="w-5 h-5" />
          <span>Voltar</span>
        </button>
        <h1 className="text-2xl font-bold mb-2">Criar Grupo Fixo</h1>
        <p className="text-purple-100">Defina as informações do grupo</p>
      </div>

      <div className="px-6 py-6 space-y-6">
        {/* Group Summary */}
        <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-2xl p-6 text-white shadow-lg">
          <div className="text-center mb-4">
            <div className="text-sm text-purple-200 mb-1">Grupo fixo</div>
            <div className="text-2xl font-bold">{dayLabels[dayOfWeek as string]} às {selectedTime as string}</div>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-purple-400">
            <div>
              <div className="text-sm text-purple-200">Jogadores</div>
              <div className="text-xl font-bold">{numberOfPlayers as number}</div>
            </div>
            <div>
              <div className="text-sm text-purple-200">Por semana</div>
              <div className="text-xl font-bold">R$ {pricePerPlayer as number}</div>
            </div>
          </div>
        </div>

        {/* Group Name */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Nome do grupo *
          </label>
          <input
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Ex: Racha das Quartas, Pelada do Escritório..."
            className="w-full px-4 py-3 border-2 border-purple-200 rounded-xl focus:border-purple-600 focus:outline-none"
          />
        </div>

        {/* Description */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Descrição (opcional)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Adicione informações sobre o grupo, regras, nível de jogo..."
            rows={4}
            className="w-full px-4 py-3 border-2 border-purple-200 rounded-xl focus:border-purple-600 focus:outline-none resize-none"
          />
        </div>

        {/* Photo Upload */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Foto do grupo (opcional)
          </label>
          <button className="w-full border-2 border-dashed border-purple-300 rounded-xl py-8 hover:border-purple-600 hover:bg-purple-50 transition-all">
            <Upload className="w-8 h-8 text-purple-400 mx-auto mb-2" />
            <div className="text-sm text-gray-600">Clique para adicionar foto</div>
          </button>
        </div>

        {/* Invite Link */}
        {groupName && (
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4">Link de convite</h2>
            <div className="bg-purple-50 rounded-xl p-4 mb-3 border-2 border-purple-200">
              <div className="text-sm text-purple-900 font-mono break-all">{inviteLink}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleCopyLink}
                className="flex items-center justify-center gap-2 bg-purple-100 text-purple-700 py-3 rounded-xl font-semibold hover:bg-purple-200 transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-5 h-5" />
                    Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="w-5 h-5" />
                    Copiar link
                  </>
                )}
              </button>
              <button className="flex items-center justify-center gap-2 bg-purple-600 text-white py-3 rounded-xl font-semibold hover:bg-purple-700 transition-colors">
                <Share2 className="w-5 h-5" />
                Compartilhar
              </button>
            </div>
          </div>
        )}

        {/* Preview Members */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-4">Membros do grupo</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-purple-50 rounded-xl border-2 border-purple-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                  V
                </div>
                <div>
                  <div className="font-semibold text-gray-900">Você (Organizador)</div>
                  <div className="text-sm text-purple-600">Criador do grupo</div>
                </div>
              </div>
              <div className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-semibold">
                Confirmado
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[...Array((numberOfPlayers as number) - 1)].map((_, i) => (
                <div key={i} className="aspect-square border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-3xl text-gray-300 mb-1">+</div>
                    <div className="text-xs text-gray-400">Vaga livre</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-violet-50 rounded-2xl p-6 border-2 border-violet-200">
          <h3 className="font-semibold text-violet-900 mb-3">ℹ️ Como funciona</h3>
          <ul className="space-y-2 text-sm text-violet-800">
            <li className="flex gap-2">
              <span>1.</span>
              <span>Você cria o grupo e compartilha o link com os jogadores</span>
            </li>
            <li className="flex gap-2">
              <span>2.</span>
              <span>Cada jogador entra pelo link e confirma pagamento</span>
            </li>
            <li className="flex gap-2">
              <span>3.</span>
              <span>O jogo é confirmado automaticamente toda semana</span>
            </li>
            <li className="flex gap-2">
              <span>4.</span>
              <span>Você gerencia presenças e substitutos pelo app</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-4 max-w-md mx-auto">
        <button
          onClick={handleCreateGroup}
          disabled={!groupName}
          className={`w-full py-4 rounded-xl font-semibold transition-all ${
            groupName
              ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white hover:from-purple-700 hover:to-purple-800 shadow-lg'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          Confirmar e pagar organização
        </button>
      </div>
    </div>
  );
}
