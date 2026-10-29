import { AppState, Platform } from 'react-native';
import { focusManager, QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Short: availability, rosters and statuses change often and must not look stale.
      staleTime: 15_000,
      retry: 2,
    },
    // Never auto-retry writes — a retried mutation could duplicate an action.
    mutations: { retry: 0 },
  },
});

// Refetch active screens when the app returns to the foreground.
AppState.addEventListener('change', status => {
  if (Platform.OS !== 'web') focusManager.setFocused(status === 'active');
});
