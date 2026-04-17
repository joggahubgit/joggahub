import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Copy .env.example to .env and fill in your values.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ── Types ────────────────────────────────────────────────────
export interface Profile {
  id: string
  name: string | null
  phone: string | null
  skill_level: 'beginner' | 'intermediate' | 'advanced' | null
  avatar_url: string | null
  location: string | null
  preferred_position: string | null
  dominant_foot: 'right' | 'left' | 'both' | null
  availability: { days: string[]; periods: string[] } | null
  bio: string | null
  role: 'player' | 'venue_admin'
  xp: number
  games_played: number
  created_at: string
}

export interface Venue {
  id: string
  name: string
  address: string | null
  city: string | null
  phone: string | null
  email: string | null
  description: string | null
  opening_hours: string | null
  image_url: string | null
  admin_id: string | null
}

export interface Court {
  id: string
  venue_id: string
  name: string
  sport_type: string
  surface: string | null
  price_per_hour: number
  min_players: number
  max_players: number
  indoor: boolean
  amenities: string[]
  images: string[]
  rating: number
  review_count: number
  is_active: boolean
  venues?: Venue
}

export interface Slot {
  id: string
  court_id: string
  start_time: string
  end_time: string
  price_override: number | null
  is_available: boolean
}

export interface Booking {
  id: string
  slot_id: string | null
  court_id: string
  created_by: string
  total_price: number
  max_players: number
  status: 'pending' | 'confirmed' | 'cancelled'
  payment_type: 'full' | 'split'
  notes: string | null
  created_at: string
  courts?: Court
  slots?: Slot
}

export interface BookingPlayer {
  id: string
  booking_id: string
  user_id: string | null
  email: string | null
  amount_owed: number
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded'
  stripe_payment_intent_id: string | null
  paid_at: string | null
}

export interface Game {
  id: string
  booking_id: string
  sport_type: string
  skill_level: 'beginner' | 'intermediate' | 'advanced' | 'mixed' | null
  max_players: number
  current_players: number
  price_per_player: number
  is_open: boolean
  description: string | null
  created_by: string
  created_at: string
  bookings?: Booking & { courts?: Court }
  profiles?: Profile
}
