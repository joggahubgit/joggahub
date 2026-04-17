import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, MessageCircle, Share2, Trophy, TrendingUp, Search, Users, User, Home as HomeIcon, Send, Calendar } from 'lucide-react';

export default function Community() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('feed');
  const [activeBottomTab, setActiveBottomTab] = useState('community');

  const feedPosts = [
    { id: 1, type: 'match_result', user: 'João Silva', timeAgo: '2 horas atrás', court: 'Arena Sports Center', score: '5 x 3', team1: 'Time Azul', team2: 'Time Branco', highlights: ['João Silva - 2 gols', 'Carlos Santos - 1 gol'], likes: 24, comments: 8, image: 'https://images.unsplash.com/photo-1624880357913-a8539238245b?w=600&q=80' },
    { id: 2, type: 'match_result', user: 'Pedro Lima', timeAgo: '5 horas atrás', court: 'Clube do Futebol', score: '4 x 4', team1: 'Vermelho', team2: 'Verde', highlights: ['Pedro Lima - Hat-trick!', 'Lucas Oliveira - 2 gols'], likes: 31, comments: 12, image: 'https://images.unsplash.com/photo-1551958219-acbc608c6377?w=600&q=80' },
    { id: 3, type: 'achievement', user: 'Ana Santos', timeAgo: '1 dia atrás', achievement: 'Subiu para nível Avançado!', xp: 500, likes: 45, comments: 15 }
  ] as any[];

  const rankings = [
    { position: 1, name: 'Carlos Mendes', xp: 2850, games: 67, avatar: 'C', trend: 'up' },
    { position: 2, name: 'Ana Paula Silva', xp: 2720, games: 58, avatar: 'A', trend: 'up' },
    { position: 3, name: 'João Silva', xp: 2580, games: 52, avatar: 'J', trend: 'same' },
    { position: 4, name: 'Pedro Lima', xp: 2440, games: 48, avatar: 'P', trend: 'down' },
    { position: 5, name: 'Rafael Costa', xp: 2350, games: 45, avatar: 'R', trend: 'up' }
  ];

  const messages = [
    { id: 1, type: 'group', name: 'Arena Sports Center', lastMessage: 'Confirmado para hoje às 19h!', time: '10 min', unread: 3, avatar: 'A' },
    { id: 2, type: 'group', name: 'Clube do Futebol - Quinta', lastMessage: 'Alguém tem uma bola extra?', time: '1 h', unread: 0, avatar: 'C' },
    { id: 3, type: 'direct', name: 'Carlos Silva', lastMessage: 'Bora jogar amanhã?', time: '3 h', unread: 1, avatar: 'C' }
  ];

  const totalUnread = messages.reduce((acc, m) => acc + m.unread, 0);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-violet-600 text-white px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">Comunidade</h1>
          <Search className="w-6 h-6 cursor-pointer" />
        </div>
      </div>

      <div className="bg-white border-b border-gray-200 px-6 sticky top-[76px] z-10">
        <div className="flex gap-6">
          {['feed', 'ranking', 'messages'].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`py-4 border-b-2 font-semibold transition-colors relative ${activeTab === tab ? 'border-violet-600 text-violet-600' : 'border-transparent text-gray-500'}`}>
              {tab === 'feed' ? 'Feed' : tab === 'ranking' ? 'Ranking' : 'Mensagens'}
              {tab === 'messages' && totalUnread > 0 && <span className="absolute -top-1 -right-2 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">{totalUnread}</span>}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'feed' && (
        <div className="px-6 py-6 space-y-4">
          {feedPosts.map((post) => (
            <div key={post.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-violet-600 rounded-full flex items-center justify-center text-white font-semibold">{post.user.charAt(0)}</div>
                <div className="flex-1"><div className="font-semibold text-gray-900">{post.user}</div><div className="text-xs text-gray-500">{post.timeAgo}</div></div>
              </div>
              {post.type === 'match_result' && (
                <>
                  {post.image && <img src={post.image} alt="Match" className="w-full h-48 object-cover" />}
                  <div className="p-4">
                    <div className="text-sm text-gray-600 mb-2">📍 {post.court}</div>
                    <div className="bg-violet-50 rounded-lg p-4 mb-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-gray-900">{post.team1}</span>
                        <span className="text-2xl font-bold text-violet-600">{post.score}</span>
                        <span className="font-semibold text-gray-900">{post.team2}</span>
                      </div>
                    </div>
                    <div className="text-sm text-gray-600"><div className="font-semibold mb-1">⚽ Destaques:</div>{post.highlights.map((h: string, i: number) => <div key={i} className="text-xs">• {h}</div>)}</div>
                  </div>
                </>
              )}
              {post.type === 'achievement' && (
                <div className="p-4">
                  <div className="bg-gradient-to-r from-yellow-50 to-yellow-100 rounded-lg p-4 mb-3 text-center">
                    <Trophy className="w-12 h-12 text-yellow-600 mx-auto mb-2" />
                    <div className="font-bold text-gray-900 mb-1">{post.achievement}</div>
                    <div className="text-sm text-yellow-700">+{post.xp} XP</div>
                  </div>
                </div>
              )}
              <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-around">
                <button className="flex items-center gap-2 text-gray-600 hover:text-violet-600"><Heart className="w-5 h-5" /><span className="text-sm">{post.likes}</span></button>
                <button className="flex items-center gap-2 text-gray-600 hover:text-violet-600"><MessageCircle className="w-5 h-5" /><span className="text-sm">{post.comments}</span></button>
                <button className="flex items-center gap-2 text-gray-600 hover:text-violet-600"><Share2 className="w-5 h-5" /><span className="text-sm">Compartilhar</span></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'ranking' && (
        <div className="py-6">
          <div className="px-6 mb-4">
            <div className="flex gap-2">
              <button className="flex-1 bg-violet-600 text-white py-3 rounded-xl font-semibold">Ranking Geral</button>
              <button className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-semibold">Por Clube</button>
            </div>
          </div>

          <div className="px-6 mb-6">
            <div className="flex items-end justify-center gap-2 mb-6">
              <div className="flex-1 text-center">
                <div className="bg-gray-300 rounded-t-xl p-4 pt-8">
                  <div className="w-16 h-16 bg-violet-600 rounded-full flex items-center justify-center text-white text-xl font-bold mx-auto mb-2">{rankings[1].avatar}</div>
                  <div className="font-semibold text-gray-900 text-sm">{rankings[1].name.split(' ')[0]}</div>
                  <div className="text-xs text-gray-600">{rankings[1].xp} XP</div>
                  <div className="text-2xl font-bold text-gray-600 mt-2">2°</div>
                </div>
              </div>
              <div className="flex-1 text-center">
                <div className="bg-yellow-400 rounded-t-xl p-4 pt-4">
                  <Trophy className="w-6 h-6 text-yellow-700 mx-auto mb-2" />
                  <div className="w-20 h-20 bg-violet-600 rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-2">{rankings[0].avatar}</div>
                  <div className="font-bold text-gray-900">{rankings[0].name.split(' ')[0]}</div>
                  <div className="text-xs text-gray-700">{rankings[0].xp} XP</div>
                  <div className="text-3xl font-bold text-yellow-700 mt-2">1°</div>
                </div>
              </div>
              <div className="flex-1 text-center">
                <div className="bg-orange-300 rounded-t-xl p-4 pt-12">
                  <div className="w-14 h-14 bg-violet-600 rounded-full flex items-center justify-center text-white text-lg font-bold mx-auto mb-2">{rankings[2].avatar}</div>
                  <div className="font-semibold text-gray-900 text-sm">{rankings[2].name.split(' ')[0]}</div>
                  <div className="text-xs text-gray-600">{rankings[2].xp} XP</div>
                  <div className="text-xl font-bold text-orange-700 mt-2">3°</div>
                </div>
              </div>
            </div>
          </div>

          <div className="px-6 space-y-2">
            {rankings.slice(3).map((player) => (
              <div key={player.position} className="bg-white rounded-xl p-4 border border-gray-200 flex items-center gap-3">
                <div className="text-lg font-bold text-gray-400 w-8 text-center">{player.position}°</div>
                <div className="w-12 h-12 bg-violet-600 rounded-full flex items-center justify-center text-white text-lg font-bold">{player.avatar}</div>
                <div className="flex-1"><div className="font-semibold text-gray-900">{player.name}</div><div className="text-sm text-gray-600">{player.games} jogos</div></div>
                <div className="text-right">
                  <div className="font-bold text-violet-600">{player.xp} XP</div>
                  <div className="flex items-center justify-end gap-1 text-xs">
                    {player.trend === 'up' && <TrendingUp className="w-3 h-3 text-green-600" />}
                    {player.trend === 'down' && <TrendingUp className="w-3 h-3 text-red-600 rotate-180" />}
                    {player.trend === 'same' && <span className="text-gray-400">—</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="px-6 mt-6">
            <div className="bg-violet-600 text-white rounded-xl p-4 flex items-center gap-3">
              <div className="text-lg font-bold w-8 text-center">12°</div>
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-lg font-bold">J</div>
              <div className="flex-1"><div className="font-semibold">Você</div><div className="text-sm text-violet-100">12 jogos</div></div>
              <div className="text-right"><div className="font-bold">1.250 XP</div></div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'messages' && (
        <div className="px-6 py-6 space-y-3">
          {messages.map((message) => (
            <div key={message.id} className="bg-white rounded-xl p-4 border border-gray-200 cursor-pointer hover:shadow-md transition-shadow">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 bg-violet-600 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0">{message.avatar}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between mb-1">
                    <div><h3 className="font-semibold text-gray-900">{message.name}</h3>{message.type === 'group' && <span className="text-xs text-gray-500">Grupo</span>}</div>
                    <span className="text-xs text-gray-500">{message.time}</span>
                  </div>
                  <p className="text-sm text-gray-600 truncate">{message.lastMessage}</p>
                </div>
                {message.unread > 0 && <div className="bg-violet-600 text-white text-xs w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0">{message.unread}</div>}
              </div>
            </div>
          ))}
          <button className="w-full bg-violet-600 text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-violet-700 transition-colors mt-6"><Send className="w-5 h-5" />Nova mensagem</button>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-3 max-w-md mx-auto">
        <div className="flex items-center justify-around">
          <button onClick={() => { setActiveBottomTab('home'); navigate('/home'); }} className={`flex flex-col items-center gap-1 ${activeBottomTab === 'home' ? 'text-violet-600' : 'text-gray-400'}`}><HomeIcon className="w-6 h-6" /><span className="text-xs">Início</span></button>
          <button onClick={() => { setActiveBottomTab('community'); navigate('/community'); }} className={`flex flex-col items-center gap-1 ${activeBottomTab === 'community' ? 'text-violet-600' : 'text-gray-400'}`}><Users className="w-6 h-6" /><span className="text-xs">Comunidade</span></button>
          <button onClick={() => { setActiveBottomTab('profile'); navigate('/profile'); }} className={`flex flex-col items-center gap-1 ${activeBottomTab === 'profile' ? 'text-violet-600' : 'text-gray-400'}`}><User className="w-6 h-6" /><span className="text-xs">Perfil</span></button>
        </div>
      </div>
    </div>
  );
}
