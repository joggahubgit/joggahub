/** Public profile + follow, ported from PublicProfile.tsx (web). */
import { supabase } from '@/lib/supabase';

export interface PublicProfileData {
  name: string | null;
  avatar_url: string | null;
  location: string | null;
  preferred_position: string | null;
  dominant_foot: string | null;
  availability: { days?: string[]; periods?: string[] } | null;
  bio: string | null;
}

export async function fetchPublicProfile(id: string): Promise<PublicProfileData | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('name, avatar_url, location, preferred_position, dominant_foot, availability, bio')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as PublicProfileData) ?? null;
}

export async function fetchIsFollowing(viewerId: string, id: string): Promise<boolean> {
  const { data } = await supabase.from('follows').select('follower_id').eq('follower_id', viewerId).eq('following_id', id).maybeSingle();
  return !!data;
}

export async function setFollowing(viewerId: string, id: string, follow: boolean) {
  const { error } = follow
    ? await supabase.from('follows').insert({ follower_id: viewerId, following_id: id })
    : await supabase.from('follows').delete().eq('follower_id', viewerId).eq('following_id', id);
  if (error) throw error;
}
