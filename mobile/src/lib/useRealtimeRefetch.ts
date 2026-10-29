import { useEffect, useRef } from 'react';
import { supabase } from './supabase';

/**
 * Calls onChange whenever any of the given tables changes (Supabase Realtime),
 * like the web screens do. The ref keeps the latest callback so the channel
 * never captures a stale closure (same idea as the web's fetchSlotsRef).
 */
export function useRealtimeRefetch(channelName: string | null, tables: string[], onChange: () => void) {
  const cb = useRef(onChange);
  useEffect(() => {
    cb.current = onChange;
  });

  const key = tables.join(',');
  useEffect(() => {
    if (!channelName) return;
    let channel = supabase.channel(channelName);
    for (const table of key.split(',')) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => cb.current());
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelName, key]);
}
