import { useState, useEffect } from 'react';
import { Calendar } from 'lucide-react';
import { supabase } from '@/lib/supabase-gestor';
import { CreateSchedule } from './CreateSchedule';

interface SimpleSettingsProps {
  venueId: string | null;
  userId?: string;
  onVenueCreated: (venue: any) => void;
}

export function SimpleSettings({ venueId, onVenueCreated }: SimpleSettingsProps) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('São Paulo');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [description, setDescription] = useState('');
  const [openingHours, setOpeningHours] = useState('Seg-Dom: 08h-23h');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);

  // Campos de quadra
  const [courtName, setCourtName] = useState('Quadra 1');
  const [surface, setSurface] = useState('Grama sintética');
  const [pricePerHour, setPricePerHour] = useState('120');

  useEffect(() => {
    if (!venueId) return;
    supabase.from('venues').select('*').eq('id', venueId).single().then(({ data }) => {
      if (data) {
        setName(data.name || '');
        setAddress(data.address || '');
        setCity(data.city || 'São Paulo');
        setPhone(data.phone || '');
        setEmail(data.email || '');
        setDescription(data.description || '');
        setOpeningHours(data.opening_hours || '');
      }
    });
  }, [venueId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const venueData = { name, address, city, phone, email, description, opening_hours: openingHours };

    if (venueId) {
      await supabase.from('venues').update(venueData).eq('id', venueId);
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: venue } = await supabase.from('venues').insert({
        ...venueData,
        admin_id: user?.id,
      }).select().single();

      if (venue) {
        // Cria a quadra padrão junto
        await supabase.from('courts').insert({
          venue_id: venue.id,
          name: courtName,
          surface,
          price_per_hour: Number(pricePerHour),
          sport_type: 'football',
          is_active: true,
        });
        onVenueCreated(venue);
      }
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Configurações</h2>

      {/* Horários das Quadras */}
      {venueId && (
        <div className="bg-white rounded-xl border-2 border-gray-100 p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Calendar className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-base">Horários das Quadras</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  Configure os dias e horários de funcionamento de cada quadra. Os jogadores verão slots a cada 30 minutos dentro do período configurado.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowSchedule(true)}
              className="flex-shrink-0 px-4 py-2 bg-purple-600 text-white rounded-xl font-semibold text-sm hover:bg-purple-700 transition-colors"
            >
              Configurar
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border-2 border-gray-100 p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <h3 className="font-semibold mb-4 text-lg">Informações do Complexo</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Nome do Complexo *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Arena JoggaHub São Paulo"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Endereço Completo *</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Rua das Flores, 123 - Bairro, São Paulo, SP"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Telefone</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(11) 99999-9999"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email de contato</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="contato@suaquadra.com"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Horário de Funcionamento</label>
                <input
                  type="text"
                  value={openingHours}
                  onChange={(e) => setOpeningHours(e.target.value)}
                  placeholder="Seg-Sex: 08h-23h | Sab-Dom: 08h-22h"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Descrição</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Descreva seu complexo esportivo..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                />
              </div>
            </div>
          </div>

          {!venueId && (
            <div className="border-t pt-6">
              <h3 className="font-semibold mb-4 text-lg">Primeira Quadra</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Nome da Quadra</label>
                  <input
                    type="text"
                    value={courtName}
                    onChange={(e) => setCourtName(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Superfície</label>
                    <select
                      value={surface}
                      onChange={(e) => setSurface(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option>Grama sintética</option>
                      <option>Grama natural</option>
                      <option>Piso emborrachado</option>
                      <option>Cimento</option>
                      <option>Salão</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Preço por Hora (R$)</label>
                    <input
                      type="number"
                      value={pricePerHour}
                      onChange={(e) => setPricePerHour(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-4">
            <button
              type="submit"
              disabled={saving}
              className="bg-purple-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:opacity-50"
            >
              {saving ? 'Salvando...' : saved ? '✓ Salvo!' : venueId ? 'Salvar Alterações' : 'Cadastrar Quadra'}
            </button>
          </div>
        </form>
      </div>

      {showSchedule && venueId && (
        <CreateSchedule
          venueId={venueId}
          onClose={() => setShowSchedule(false)}
          onSaved={() => setShowSchedule(false)}
        />
      )}
    </div>
  );
}
