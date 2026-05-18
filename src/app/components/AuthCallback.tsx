import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function AuthCallback() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      navigate('/auth', { replace: true });
      return;
    }

    // If profile failed to load, go to home — ProtectedRoute will decide
    if (!profile) {
      navigate('/home', { replace: true });
      return;
    }

    const profileComplete = !!profile.onboarding_completed || !!profile.preferred_position;
    const onboardingDone = !!localStorage.getItem(`onboarding_done_${user.id}`);

    if (!profileComplete && !onboardingDone) {
      navigate('/onboarding', { replace: true });
    } else {
      navigate('/home', { replace: true });
    }
  }, [loading, user, profile, navigate]);

  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-violet-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
