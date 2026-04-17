import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, CreditCard, Smartphone, Check, Calendar, Clock, MapPin, Users, Loader2 } from 'lucide-react';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { stripePromise } from '@/lib/stripe';

function StripePaymentForm({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [stripeError, setStripeError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setProcessing(true);
    setStripeError('');
    const { error } = await stripe.confirmPayment({ elements, confirmParams: { return_url: `${window.location.origin}/booking-success` } });
    if (error) {
      setStripeError(error.message ?? 'Pagamento falhou.');
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      {stripeError && <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">{stripeError}</p>}
      <button type="submit" disabled={!stripe || processing} className="w-full bg-violet-600 text-white py-4 rounded-xl font-semibold hover:bg-violet-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
        {processing && <Loader2 className="w-5 h-5 animate-spin" />}
        {processing ? 'Processando...' : 'Confirmar pagamento'}
      </button>
    </form>
  );
}

export default function Payment() {
  const navigate = useNavigate();
  const location = useLocation();
  const bookingData = location.state as any;

  const [paymentMethod, setPaymentMethod] = useState('');
  const [processing, setProcessing] = useState(false);
  // clientSecret would come from createPaymentIntent() — set to null to use the mock flow
  const [clientSecret] = useState<string | null>(null);

  const serviceFee = bookingData?.totalPrice ? bookingData.totalPrice * 0.1 : 2.50;
  const baseAmount = bookingData?.paymentType === 'split' ? (bookingData.pricePerPerson ?? 25) : (bookingData?.totalPrice ?? 25);
  const finalTotal = baseAmount + serviceFee;

  const handleMockPayment = () => {
    setProcessing(true);
    setTimeout(() => navigate('/booking-success'), 1500);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-violet-600 text-white px-6 py-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)}><ArrowLeft className="w-6 h-6" /></button>
          <h1 className="text-xl font-bold">Pagamento</h1>
        </div>
      </div>

      <div className="px-6 py-6 space-y-6">
        {/* Booking Details */}
        {bookingData && (
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <h2 className="font-semibold text-gray-900 mb-3">Detalhes da reserva</h2>
            <div className="space-y-3">
              <div>
                <h3 className="font-semibold text-gray-900">{bookingData.club}</h3>
                <div className="flex items-center gap-1 text-sm text-gray-600"><MapPin className="w-3 h-3" /><span>{bookingData.location}</span></div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="flex items-center gap-1 text-gray-600 mb-1"><Calendar className="w-4 h-4" /><span>Data</span></div>
                  <div className="font-semibold text-gray-900">{bookingData.date}</div>
                </div>
                <div>
                  <div className="flex items-center gap-1 text-gray-600 mb-1"><Clock className="w-4 h-4" /><span>Horário</span></div>
                  <div className="font-semibold text-gray-900">{bookingData.time}</div>
                </div>
              </div>
              {bookingData.paymentType === 'split' && (
                <div className="bg-violet-50 rounded-lg p-3 flex items-center gap-2">
                  <Users className="w-4 h-4 text-violet-600" />
                  <div className="flex-1">
                    <div className="text-sm text-gray-600">Valor dividido entre</div>
                    <div className="font-semibold text-gray-900">{bookingData.numberOfPlayers} jogadores</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Order Summary */}
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <h2 className="font-semibold text-gray-900 mb-3">Resumo do pedido</h2>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">{bookingData?.court || 'Reserva de quadra'}</span>
              <span className="font-semibold">R$ {baseAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Taxa de serviço (10%)</span>
              <span className="font-semibold">R$ {serviceFee.toFixed(2)}</span>
            </div>
            <div className="border-t border-gray-200 pt-2 mt-2">
              <div className="flex justify-between">
                <span className="font-semibold text-gray-900">Total</span>
                <span className="font-bold text-violet-600 text-lg">R$ {finalTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Stripe Integration — show when clientSecret is available */}
        {clientSecret ? (
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <h2 className="font-semibold text-gray-900 mb-4">Pagamento seguro via Stripe</h2>
            <Elements stripe={stripePromise} options={{ clientSecret }}>
              <StripePaymentForm onSuccess={() => navigate('/booking-success')} />
            </Elements>
          </div>
        ) : (
          <>
            {/* Mock payment methods (shown until Stripe is configured) */}
            <div className="space-y-3">
              <h2 className="font-semibold text-gray-900">Método de pagamento</h2>
              {[
                { id: 'credit', label: 'Cartão de crédito', sub: 'Débito ou crédito', icon: <CreditCard className="w-5 h-5 text-violet-600" />, bg: 'bg-violet-100' },
                { id: 'pix', label: 'Pix', sub: 'Aprovação instantânea', icon: <Smartphone className="w-5 h-5 text-green-600" />, bg: 'bg-green-100' },
              ].map((method) => (
                <button key={method.id} onClick={() => setPaymentMethod(method.id)} className={`w-full p-4 rounded-xl border-2 text-left transition-all ${paymentMethod === method.id ? 'border-violet-600 bg-violet-50' : 'border-gray-200 hover:border-violet-300'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`${method.bg} rounded-full p-2`}>{method.icon}</div>
                      <div><div className="font-semibold text-gray-900">{method.label}</div><div className="text-sm text-gray-600">{method.sub}</div></div>
                    </div>
                    {paymentMethod === method.id && <div className="bg-violet-600 rounded-full p-1"><Check className="w-4 h-4 text-white" /></div>}
                  </div>
                </button>
              ))}
            </div>

            {paymentMethod === 'credit' && (
              <div className="bg-white rounded-xl p-4 border border-gray-200 space-y-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-2">Número do cartão</label><input type="text" placeholder="0000 0000 0000 0000" className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:border-violet-600 focus:outline-none" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-sm font-medium text-gray-700 mb-2">Validade</label><input type="text" placeholder="MM/AA" className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:border-violet-600 focus:outline-none" /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-2">CVV</label><input type="text" placeholder="123" className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:border-violet-600 focus:outline-none" /></div>
                </div>
              </div>
            )}

            {paymentMethod === 'pix' && (
              <div className="bg-white rounded-xl p-6 border border-gray-200 text-center">
                <div className="w-48 h-48 mx-auto bg-gray-100 rounded-lg flex items-center justify-center mb-4"><div className="text-gray-400 text-sm">QR Code PIX</div></div>
                <p className="text-sm text-gray-600 mb-2">Escaneie o QR Code com o app do seu banco</p>
                <button className="text-violet-600 text-sm font-semibold">Copiar código PIX</button>
              </div>
            )}

            <button onClick={handleMockPayment} disabled={!paymentMethod || processing} className="w-full bg-violet-600 text-white py-4 rounded-xl font-semibold hover:bg-violet-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {processing && <Loader2 className="w-5 h-5 animate-spin" />}
              {processing ? 'Processando...' : 'Confirmar pagamento'}
            </button>

            <p className="text-center text-xs text-gray-500">
              💡 Para aceitar pagamentos reais, configure <code>VITE_STRIPE_PUBLISHABLE_KEY</code> e o Edge Function <code>create-payment-intent</code>.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
