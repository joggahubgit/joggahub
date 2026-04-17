import { useNavigate, useLocation } from 'react-router-dom';
import { CheckCircle, Calendar, MapPin, Share2, Copy, MessageCircle } from 'lucide-react';
import { useState } from 'react';

export default function BookingSuccess() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showShareOptions, setShowShareOptions] = useState(false);
  const [copied, setCopied] = useState(false);

  const { bookingId, time, price, courtName, venueName, date, isOpenGame, maxPlayers } = (location.state as any) ?? {};

  const shareLink = bookingId ? `joggahub.app/booking/${bookingId}` : 'joggahub.app';

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Format the date from ISO string if provided
  const formattedDate = date
    ? new Date(date).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    : time
    ? ''
    : '';

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-12">
      <div className="text-center mb-8">
        <div className="inline-block bg-green-100 rounded-full p-4 mb-4">
          <CheckCircle className="w-16 h-16 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {isOpenGame ? 'Partida criada!' : 'Reserva confirmada!'}
        </h1>
        <p className="text-gray-600">
          {isOpenGame
            ? `Sua partida está aberta para mais ${(maxPlayers ?? 1) - 1} jogadores.`
            : 'Você está dentro! Prepare-se para o jogo.'}
        </p>
      </div>

      <div className="bg-white rounded-xl p-6 border border-gray-200 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">{isOpenGame ? 'Detalhes da partida' : 'Detalhes da reserva'}</h2>
        <div className="space-y-4">
          {(courtName || venueName) && (
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-violet-600 mt-0.5" />
              <div>
                <div className="font-medium text-gray-900">{venueName || courtName}</div>
                {courtName && venueName && <div className="text-sm text-gray-600">{courtName}</div>}
              </div>
            </div>
          )}
          {time && (
            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-violet-600 mt-0.5" />
              <div>
                <div className="font-medium text-gray-900">{isOpenGame ? `${time} · ${maxPlayers} jogadores` : time}</div>
                {formattedDate && <div className="text-sm text-gray-600">{formattedDate}</div>}
              </div>
            </div>
          )}
        </div>
        <div className="mt-6 pt-6 border-t border-gray-200">
          <div className="flex justify-between mb-1">
            <span className="text-gray-600">{isOpenGame ? 'Sua parte' : 'Valor pago'}</span>
            <span className="font-bold text-gray-900">R$ {price ?? '—'}</span>
          </div>
          {bookingId && <div className="text-xs text-gray-400 mt-1">#{bookingId.slice(0, 8)}</div>}
        </div>
      </div>

      <div className="bg-gradient-to-r from-violet-500 to-violet-600 rounded-xl p-6 text-white mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Share2 className="w-6 h-6" />
          <div>
            <h3 className="font-bold text-lg">{isOpenGame ? 'Divulgue sua partida!' : 'Convide jogadores!'}</h3>
            <p className="text-sm text-violet-100">{isOpenGame ? `Faltam ${(maxPlayers ?? 1) - 1} jogadores para completar` : 'Divida o valor com seus amigos'}</p>
          </div>
        </div>
        <button onClick={() => setShowShareOptions(!showShareOptions)} className="w-full bg-white text-violet-600 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-violet-50 transition-colors">
          <Share2 className="w-5 h-5" />Compartilhar reserva
        </button>
      </div>

      {showShareOptions && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50">
          <div className="bg-white rounded-t-3xl p-6 w-full max-w-md">
            <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-6" />
            <h3 className="font-bold text-gray-900 text-lg mb-4">Compartilhar reserva</h3>
            <div className="space-y-3 mb-6">
              <button onClick={handleCopyLink} className="w-full bg-gray-100 p-4 rounded-xl flex items-center gap-3 hover:bg-gray-200 transition-colors">
                <div className="bg-violet-100 rounded-full p-2">{copied ? <CheckCircle className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5 text-violet-600" />}</div>
                <div className="flex-1 text-left">
                  <div className="font-semibold text-gray-900">{copied ? 'Link copiado!' : 'Copiar link'}</div>
                  <div className="text-sm text-gray-600 truncate">{shareLink}</div>
                </div>
              </button>
              <button onClick={() => window.open(`https://wa.me/?text=Vem jogar comigo! ${shareLink}`, '_blank')} className="w-full bg-gray-100 p-4 rounded-xl flex items-center gap-3 hover:bg-gray-200 transition-colors">
                <div className="bg-green-100 rounded-full p-2">
                  <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a9.87 9.87 0 00-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                </div>
                <div className="text-left"><div className="font-semibold text-gray-900">WhatsApp</div><div className="text-sm text-gray-600">Compartilhar via WhatsApp</div></div>
              </button>
            </div>
            <button onClick={() => setShowShareOptions(false)} className="w-full bg-gray-200 text-gray-700 py-3 rounded-xl font-semibold">Fechar</button>
          </div>
        </div>
      )}

      <div className="space-y-3 mb-6">
        <button onClick={() => navigate('/community')} className="w-full bg-violet-600 text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-violet-700 transition-colors">
          <MessageCircle className="w-5 h-5" />Acessar chat do grupo
        </button>
        <button onClick={() => navigate('/home')} className="w-full bg-white border-2 border-gray-200 text-gray-700 py-4 rounded-xl font-semibold hover:bg-gray-50 transition-colors">
          Voltar ao início
        </button>
      </div>
    </div>
  );
}
