import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Users, Zap, Shield, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/app/contexts/AuthContext';

type GameType = 'casual' | 'competitive';

const GAME_TYPES: { value: GameType; label: string; badge: string; color: string; bg: string; border: string; points: string[] }[] = [
  {
    value: 'casual',
    label: 'Partida Casual',
    badge: '⚽',
    color: 'text-green-700',
    bg: 'bg-green-50',
    border: 'border-green-400',
    points: [
      'Times sorteados e rotativos',
      '+15 XP por participar',
      '+30 XP ao melhor jogador (votação)',
    ],
  },
  {
    value: 'competitive',
    label: 'Partida Competitiva',
    badge: '🏆',
    color: 'text-violet-700',
    bg: 'bg-violet-50',
    border: 'border-violet-500',
    points: [
      'Times pré-definidos pelo organizador',
      '+15 XP por participar',
      '+30 XP ao melhor jogador (votação)',
    ],
  },
];

const PLAYER_OPTIONS = [8, 10, 12, 14, 16];

export default function CreateGame() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [step, setStep] = useState(1);
  const TOTAL_STEPS = 2;

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [gameType, setGameType] = useState<GameType | null>(null);
  const [gameData, setGameData] = useState({
    maxPlayers: 10,
    level: '',
    price: '',
    description: '',
  });

  function canAdvance() {
    if (step === 1) return gameType !== null && gameData.maxPlayers > 0 && gameData.level !== '';
    if (step === 2) return gameData.price !== '';
    return false;
  }

  async function handleSubmit() {
    if (!user || !gameType) return;
    setSubmitting(true);
    setError('');
    try {
      const { error: insertErr } = await supabase.from('games').insert({
        organizer_id: user.id,
        game_type: gameType,
        skill_level: gameData.level,
        max_players: gameData.maxPlayers,
        current_players: 1,
        price_per_player: parseFloat(gameData.price) || 0,
        description: gameData.description || null,
        is_open: true,
        status: 'scheduled',
      });
      if (insertErr) throw insertErr;
      navigate('/find-games');
    } catch (err: any) {
      setError(err.message ?? 'Erro ao criar partida.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleNext() {
    if (step < TOTAL_STEPS) setStep(s => s + 1);
    else handleSubmit();
  }

  const progress = step === 0 ? 0 : Math.round((step / TOTAL_STEPS) * 100);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-violet-600 text-white px-6 pt-10 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => (step === 1 ? navigate(-1) : setStep(s => s - 1))}>
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-bold">Criar partida aberta</h1>
        </div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-violet-200">Passo {step} de {TOTAL_STEPS}</span>
          <span className="text-sm text-violet-200">{progress}%</span>
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i < step ? 'bg-white' : 'bg-violet-400'}`}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 px-6 py-8 flex flex-col">

        {/* ── Step 1: Tipo + Jogadores + Nível ── */}
        {step === 1 && (
          <div className="flex flex-col gap-6 flex-1">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Detalhes do jogo</h2>
              <p className="text-gray-500 mt-1 text-sm">Configure o tipo, jogadores e nível</p>
            </div>

            {/* Game type — compact toggle */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">Tipo de partida</label>
              <div className="flex gap-2">
                {GAME_TYPES.map(type => (
                  <button
                    key={type.value}
                    onClick={() => setGameType(type.value)}
                    className={`flex-1 flex flex-col items-center gap-1.5 py-3.5 px-3 rounded-xl border-2 transition-all ${
                      gameType === type.value
                        ? `${type.border} ${type.bg}`
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <span className="text-2xl">{type.badge}</span>
                    <span className={`text-xs font-bold leading-tight text-center ${gameType === type.value ? type.color : 'text-gray-600'}`}>
                      {type.label}
                    </span>
                    {gameType === type.value && (
                      <div className="flex flex-wrap justify-center gap-1 mt-1">
                        {type.points.slice(0, 2).map((p, i) => (
                          <span key={i} className="text-[9px] text-gray-500 flex items-center gap-0.5">
                            <Zap className="w-2.5 h-2.5 text-amber-400" />{p}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Players */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                Número de jogadores
              </label>
              <div className="flex gap-2 flex-wrap">
                {PLAYER_OPTIONS.map(n => (
                  <button
                    key={n}
                    onClick={() => setGameData(d => ({ ...d, maxPlayers: n }))}
                    className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold border-2 transition-all text-sm ${
                      gameData.maxPlayers === n
                        ? 'border-violet-600 bg-violet-600 text-white'
                        : 'border-gray-200 text-gray-700 hover:border-violet-200'
                    }`}
                  >
                    <Users className="w-4 h-4" /> {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Level */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">Nível da partida</label>
              <div className="space-y-2">
                {[
                  { value: 'beginner', label: 'Iniciante', desc: 'Jogo leve, sem pressão' },
                  { value: 'intermediate', label: 'Intermediário', desc: 'Jogo regular com bom nível' },
                  { value: 'advanced', label: 'Avançado', desc: 'Nível alto, ritmo intenso' },
                  { value: 'mixed', label: 'Misto', desc: 'Todos os níveis bem-vindos' },
                ].map(level => (
                  <button
                    key={level.value}
                    onClick={() => setGameData(d => ({ ...d, level: level.value }))}
                    className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                      gameData.level === level.value
                        ? 'border-violet-600 bg-violet-50'
                        : 'border-gray-200 hover:border-violet-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-gray-900">{level.label}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{level.desc}</div>
                      </div>
                      {gameData.level === level.value && (
                        <div className="w-5 h-5 bg-violet-600 rounded-full flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Preço ── */}
        {step === 2 && (
          <div className="flex flex-col gap-6 flex-1">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Valor por jogador</h2>
              <p className="text-gray-500 mt-1 text-sm">Defina quanto cada participante vai pagar</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Preço (R$)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">R$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={gameData.price}
                  onChange={e => setGameData(d => ({ ...d, price: e.target.value }))}
                  className="w-full pl-10 pr-4 py-4 border-2 border-gray-200 rounded-xl focus:border-violet-600 focus:outline-none text-lg font-semibold"
                  placeholder="25,00"
                />
              </div>
              <p className="text-xs text-gray-400 mt-2">Sugestão: R$ 20 – R$ 40 por pessoa</p>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Descrição <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <textarea
                value={gameData.description}
                onChange={e => setGameData(d => ({ ...d, description: e.target.value }))}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-violet-600 focus:outline-none h-28 resize-none text-sm"
                placeholder="Ex: Pelada toda sexta entre amigos. Todos bem-vindos!"
              />
            </div>

            {/* Summary */}
            <div className={`rounded-2xl p-4 border ${gameType === 'competitive' ? 'bg-violet-50 border-violet-200' : 'bg-green-50 border-green-200'}`}>
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-3">Resumo</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Tipo</span>
                  <span className="font-semibold text-gray-900">
                    {gameType === 'casual' ? '⚽ Casual' : '🏆 Competitiva'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Jogadores</span>
                  <span className="font-semibold text-gray-900">{gameData.maxPlayers}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Nível</span>
                  <span className="font-semibold text-gray-900 capitalize">{gameData.level}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Preço/jogador</span>
                  <span className="font-bold text-violet-600">
                    R$ {parseFloat(gameData.price || '0').toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {gameType === 'competitive' && (
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <Shield className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  <strong>Partida competitiva:</strong> você poderá definir os times e registrar o placar após criar a partida.
                </p>
              </div>
            )}

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>
            )}
          </div>
        )}

        {/* CTA */}
        <button
          onClick={handleNext}
          disabled={submitting || !canAdvance()}
          className="w-full bg-violet-600 text-white py-4 rounded-xl font-bold text-base hover:bg-violet-700 transition-colors disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed mt-8 flex items-center justify-center gap-2"
        >
          {submitting ? (
            'Criando partida...'
          ) : step === TOTAL_STEPS ? (
            'Criar partida'
          ) : (
            <><span>Continuar</span><ChevronRight className="w-5 h-5" /></>
          )}
        </button>

        {step > 1 && (
          <button
            onClick={() => setStep(s => s - 1)}
            className="w-full text-gray-500 py-3 mt-2 text-sm font-medium"
          >
            Voltar
          </button>
        )}
      </div>
    </div>
  );
}
