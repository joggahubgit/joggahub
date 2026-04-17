import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { LanguageProvider } from './contexts/LanguageContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Landing from './components/Landing';
import Auth from './components/Auth';
import Onboarding from './components/Onboarding';
import Home from './components/Home';
import FindCourts from './components/FindCourts';
import CourtDetails from './components/CourtDetails';
import FindGames from './components/FindGames';
import GameDetails from './components/GameDetails';
import Payment from './components/Payment';
import BookingSuccess from './components/BookingSuccess';
import Community from './components/Community';
import Competitions from './components/Competitions';
import Coaching from './components/Coaching';
import Profile from './components/Profile';
import CreateGame from './components/CreateGame';
import FixedGroups from './components/FixedGroups';
import RecurringBookingSetup from './components/RecurringBookingSetup';
import RecurringGroupCreation from './components/RecurringGroupCreation';
import RecurringPayment from './components/RecurringPayment';
import MyGroups from './components/MyGroups';
import GroupDetails from './components/GroupDetails';
import SubscriptionGroupSetup from './components/SubscriptionGroupSetup';
import SubscriptionGroupDetails from './components/SubscriptionGroupDetails';
import SubscriptionPlayerJoin from './components/SubscriptionPlayerJoin';
import SubscriptionConfirmation from './components/SubscriptionConfirmation';
import WeeklyConfirmation from './components/WeeklyConfirmation';
import CourtManagerDashboard from './components/CourtManagerDashboard';
import MenuPage from './components/MenuPage';
import Notifications from './components/Notifications';
import PaymentsPage from './components/PaymentsPage';
import SettingsPage from './components/SettingsPage';
import HelpPage from './components/HelpPage';
import TermsPage from './components/TermsPage';
import PrivacyPage from './components/PrivacyPage';
import BookCourt from './components/BookCourt';
import PrivateGameReview from './components/PrivateGameReview';
import OpenGameReview from './components/OpenGameReview';
import OpenGamePage from './components/OpenGamePage';
import JoinGameReview from './components/JoinGameReview';
import PaymentSuccess from './components/PaymentSuccess';
import MyBookings from './components/MyBookings';

/** Redirect to /auth if not logged in, else render children */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="w-8 h-8 border-4 border-violet-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (!user) return <Navigate to="/auth" replace />;
  // Redirect to onboarding if profile is incomplete.
  // Also checks localStorage to avoid a race condition where the profile
  // context hasn't updated yet right after onboarding is saved.
  const onboardingDone = !!localStorage.getItem(`onboarding_done_${user.id}`);
  const profileComplete = !!profile?.preferred_position;
  if (!onboardingDone && !profileComplete && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <div className="max-w-md mx-auto bg-white shadow-xl min-h-screen">
      <Routes>
        {/* Public */}
        <Route path="/" element={<Landing />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />

        {/* Protected */}
        <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
        <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/find-courts" element={<ProtectedRoute><FindCourts /></ProtectedRoute>} />
        <Route path="/court-details/:id" element={<ProtectedRoute><CourtDetails /></ProtectedRoute>} />
        <Route path="/find-games" element={<ProtectedRoute><FindGames /></ProtectedRoute>} />
        <Route path="/game-details/:id" element={<ProtectedRoute><GameDetails /></ProtectedRoute>} />
        <Route path="/payment" element={<ProtectedRoute><Payment /></ProtectedRoute>} />
        <Route path="/booking-success" element={<ProtectedRoute><BookingSuccess /></ProtectedRoute>} />
        <Route path="/booking-confirmation" element={<ProtectedRoute><Payment /></ProtectedRoute>} />
        <Route path="/create-game" element={<ProtectedRoute><CreateGame /></ProtectedRoute>} />
        <Route path="/create-open-game" element={<ProtectedRoute><CreateGame /></ProtectedRoute>} />
        <Route path="/fixed-groups" element={<ProtectedRoute><FixedGroups /></ProtectedRoute>} />
        <Route path="/recurring-booking-setup" element={<ProtectedRoute><RecurringBookingSetup /></ProtectedRoute>} />
        <Route path="/recurring-group-creation" element={<ProtectedRoute><RecurringGroupCreation /></ProtectedRoute>} />
        <Route path="/recurring-payment" element={<ProtectedRoute><RecurringPayment /></ProtectedRoute>} />
        <Route path="/my-groups" element={<ProtectedRoute><MyGroups /></ProtectedRoute>} />
        <Route path="/group-details/:id" element={<ProtectedRoute><GroupDetails /></ProtectedRoute>} />
        <Route path="/subscription-group-setup" element={<ProtectedRoute><SubscriptionGroupSetup /></ProtectedRoute>} />
        <Route path="/subscription-group-details" element={<ProtectedRoute><SubscriptionGroupDetails /></ProtectedRoute>} />
        <Route path="/subscription-player-join" element={<ProtectedRoute><SubscriptionPlayerJoin /></ProtectedRoute>} />
        <Route path="/subscription-confirmation" element={<ProtectedRoute><SubscriptionConfirmation /></ProtectedRoute>} />
        <Route path="/weekly-confirmation" element={<ProtectedRoute><WeeklyConfirmation /></ProtectedRoute>} />
        <Route path="/court-manager-dashboard" element={<ProtectedRoute><CourtManagerDashboard /></ProtectedRoute>} />
        <Route path="/community" element={<ProtectedRoute><Community /></ProtectedRoute>} />
        <Route path="/competitions" element={<ProtectedRoute><Competitions /></ProtectedRoute>} />
        <Route path="/competition-details/:id" element={<ProtectedRoute><Competitions /></ProtectedRoute>} />
        <Route path="/coaching" element={<ProtectedRoute><Coaching /></ProtectedRoute>} />
        <Route path="/coach-details/:id" element={<ProtectedRoute><Coaching /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
        <Route path="/menu" element={<ProtectedRoute><MenuPage /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
        <Route path="/payments" element={<ProtectedRoute><PaymentsPage /></ProtectedRoute>} />
        <Route path="/help" element={<ProtectedRoute><HelpPage /></ProtectedRoute>} />
        <Route path="/book-court" element={<ProtectedRoute><BookCourt /></ProtectedRoute>} />
        <Route path="/private-game-review" element={<ProtectedRoute><PrivateGameReview /></ProtectedRoute>} />
        <Route path="/open-game-review" element={<ProtectedRoute><OpenGameReview /></ProtectedRoute>} />
        <Route path="/open-game/:id" element={<ProtectedRoute><OpenGamePage /></ProtectedRoute>} />
        <Route path="/join-game-review/:id" element={<ProtectedRoute><JoinGameReview /></ProtectedRoute>} />
        <Route path="/payment-success" element={<ProtectedRoute><PaymentSuccess /></ProtectedRoute>} />
        <Route path="/my-bookings" element={<ProtectedRoute><MyBookings /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <Router>
          <AppRoutes />
        </Router>
      </LanguageProvider>
    </AuthProvider>
  );
}
