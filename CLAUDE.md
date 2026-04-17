# JoggaHub — Project Instructions

## What is this

JoggaHub is a Brazilian sports court booking platform. Players browse venues, book court slots, and create open games. Club managers have a separate dashboard to view their agenda and bookings.

## Apps

| App | Entry point | Dev URL |
|-----|-------------|---------|
| Player app | `index.html` | `http://localhost:5173` |
| Gestor (manager) app | `gestor.html` | `http://localhost:5173/gestor.html` |

## Stack

- **Frontend:** React + TypeScript + Vite + Tailwind CSS
- **Backend:** Supabase (Postgres + Auth + Edge Functions)
- **Payments:** Stripe (test mode — card `4242 4242 4242 4242`)
- **Edge Functions:** Deno, in `supabase/functions/`

## Project structure

```
src/
  app/
    components/     # Player app screens
    lib/            # Shared utils (checkout.ts, gameConfig.ts, supabase.ts)
    contexts/       # AuthContext
  gestor/
    components/     # Manager dashboard (SmartBookingCalendar, SimpleDashboard, etc.)
    GestorApp.tsx
supabase/
  functions/        # Edge Functions (Deno)
  migrations/       # SQL migrations
  schema.sql        # Full DB schema reference
```

## Key files

| File | Purpose |
|------|---------|
| `src/app/components/PaymentSuccess.tsx` | Central payment callback — creates games and bookings after Stripe confirms |
| `src/app/components/CourtDetails.tsx` | Court page — slot picker, booking and open game flows |
| `src/app/components/OpenGamePage.tsx` | Open game view for players and organizer |
| `src/app/components/MyBookings.tsx` | Player's booking history (paginated, 10/page) |
| `src/app/lib/checkout.ts` | `redirectToCheckout()` and `calcFees()` |
| `src/app/lib/gameConfig.ts` | `getMinPlayersForSport()`, cancel cutoff constants |
| `supabase/functions/process-game-transitions/` | Cron: auto-cancels open games, transitions statuses |
| `supabase/functions/confirm-slot-booking/` | Creates private game + booking after payment |
| `supabase/functions/create-slot-checkout-session/` | Creates Stripe session for private bookings |
| `src/gestor/components/SmartBookingCalendar.tsx` | Manager's live agenda calendar |

## Database — key tables

| Table | Purpose |
|-------|---------|
| `games` | Open and private games. `is_open=true` = open game, `is_open=false + booking_id` = private game |
| `game_players` | Players enrolled in a game |
| `slots` | Court availability slots. `is_available=false` = booked |
| `bookings` | Private slot bookings (created by `confirm-slot-booking`) |
| `notifications` | In-app notifications for players |
| `profiles` | User profiles |

## Game status lifecycle

```
scheduled → confirmed_booking → pending_results → completed
         ↘ expired  (auto-cancel by cron or manual cancel)
```

- `scheduled` — created, open for players to join
- `confirmed_booking` — minimum players reached
- `pending_results` — 5 min after slot end, waiting for MVP vote
- `completed` — results submitted or 12h window expired
- `expired` — never reached minimum players or organizer cancelled

## Important conventions

### Private game vs cancelled open game (discriminator)
- Private games: `is_open=false` AND `booking_id IS NOT NULL`
- Cancelled/expired open games: `is_open=false` AND `booking_id IS NULL`

### Fees
- Service fee: 15% on top of `vagaPrice`
- Use `calcFees(vagaPrice)` from `src/app/lib/checkout.ts`

### Minimum players per sport
- Use `getMinPlayersForSport(sportType)` from `src/app/lib/gameConfig.ts`
- Futsal: 2 (temporary), all others: 8

### DB writes only happen after payment
- No game or booking records are created before Stripe confirms payment
- All game params are passed via Stripe success URL query params
- `PaymentSuccess.tsx` reads params and creates the DB records

### `created_by` is required on game inserts
- The `games` table RLS INSERT policy checks `auth.uid() = created_by OR auth.uid() = organizer_id`
- Always set both `created_by` and `organizer_id` when inserting a game from the client

## Auto-cancel rules (cron — runs every minute)

Open games with insufficient players are auto-cancelled before the slot starts:

| Fill rate | Cancel window |
|-----------|---------------|
| ≤ 20% | 6h before start |
| ≤ 40% | 4h before start |
| > 40% and < 100% | 2h before start |

On cancel: `status='expired'`, `is_open=false`, slot freed, all players notified.

## Running locally

```bash
npm install
npm run dev
```

Requires a `.env` file (never commit this):
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_STRIPE_PUBLISHABLE_KEY=
```

Edge Functions need their own env vars set in the Supabase dashboard.

## Known pending issues

- `sport_type` not passed in private game insert (PaymentSuccess private_game branch)
- `handleCancelGame` in OpenGamePage should use `game.slot_id` not `passed?.slotId`
- MyBookings shows duplicate entry for private game organizer (slot booking + game_organizer)
- `price_per_player: 0` for full-mode private games
