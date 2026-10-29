// Stripe's cancel_url deep link. Normally the auth browser just closes and the
// user stays where they were; this only renders if the app was reopened by the link.
import { Redirect } from 'expo-router';

export default function PaymentCancelled() {
  return <Redirect href="/" />;
}
