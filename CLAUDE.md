# JoggaHub — Project Instructions

## What is this

JoggaHub is a Brazilian sports court booking platform for **football only** (society and futsal — no other sports). Players browse venues, book court slots, and create open games. Club managers have a separate dashboard to view their agenda and bookings.

## Apps

| App | Entry point | Dev URL |
|-----|-------------|---------|
| Player app | `index.html` | `http://localhost:5173` |
| Gestor (manager) app | `gestor.html` | `http://localhost:5173/gestor.html` |

## Stack

- **Frontend:** React + TypeScript + Vite + Tailwind CSS
- **Backend:** Supabase (Postgres + Auth + Edge Functions)
- **Payments:** Stripe — test card `4242 4242 4242 4242`
- **Edge Functions:** Deno, in `supabase/functions/`
- **Deploy:** Vercel (frontend) + Supabase (backend)

## Project structure

```
src/
  app/
    components/     # Player app screens
    lib/            # checkout.ts, gameConfig.ts, supabase.ts
    contexts/       # AuthContext
  gestor/
    components/     # SmartBookingCalendar, SimpleDashboard, SlotModal, etc.
    GestorApp.tsx
supabase/
  functions/        # Edge Functions (Deno)
  migrations/       # SQL migrations
  schema.sql        # Full DB schema reference
```

## Key files

| File | Purpose |
|------|---------|
| `src/app/components/PaymentSuccess.tsx` | Central payment callback — creates games/bookings after Stripe confirms |
| `src/app/components/CourtDetails.tsx` | Court page — slot picker, booking and open game flows |
| `src/app/components/OpenGamePage.tsx` | Open game view for players and organizer |
| `src/app/components/Home.tsx` | Player home — upcoming games cards |
| `src/app/components/MyBookings.tsx` | Player's booking history |
| `src/app/components/PrivateGameReview.tsx` | Review screen before private game checkout |
| `src/app/lib/checkout.ts` | `redirectToCheckout()`, payment modes, fee calc |
| `src/app/lib/gameConfig.ts` | `getMinPlayersForSport()`, cancel/join cutoff constants |
| `src/gestor/components/SmartBookingCalendar.tsx` | Manager's live agenda calendar |
| `src/gestor/components/CreateSchedule.tsx` | Block schedule creation for manager |
| `src/gestor/components/SlotModal.tsx` | Slot detail modal for manager (shows game, players, revenue) |

## Database — key tables

| Table | Purpose |
|-------|---------|
| `games` | Open and private games |
| `game_players` | Players enrolled in a game |
| `slots` | Court availability. `is_available=false` = booked |
| `bookings` | Private slot bookings (created by `confirm-slot-booking`) |
| `notifications` | In-app notifications for players |
| `profiles` | User profiles |
| `venues` | Clubs. `admin_id` = manager user id |
| `courts` | Courts within a venue |

### game_players columns
`id`, `game_id`, `player_id`, `player_name`, `paid`, `stripe_payment_intent_id`
— **no** `joined_at`, **no** `created_at`

### games extra columns (beyond schema.sql)
- `scheduled_end_at TIMESTAMPTZ` — real session end time; set by PaymentSuccess on insert
- `stripe_session_id TEXT` — Stripe checkout session for split payment hold
- `stripe_split_captured BOOL` — whether the hold was captured
- `court_price NUMERIC` — full court price (for split payment)

### slots — price_override
`price_override` stores the **hourly rate** (R$/h), not the total. Multiply by `durationHours` to get the real price.

## Game type discriminator

| Type | `is_open` | `booking_id` |
|------|-----------|--------------|
| Open game | `true` | `NULL` |
| Private game | `false` | `NOT NULL` |
| Cancelled/expired open game | `false` | `NULL` |

## Game status lifecycle

```
scheduled → confirmed_booking → pending_results → completed
         ↘ expired / cancelled
```

- `expired` — natural expiry (cron or timeout)
- `cancelled` — explicit action (player/manager)
- Active statuses: `scheduled`, `confirmed_booking`

## Payment flows

### Private game — full (one player pays full court)
1. Player selects slot + duration → `create-slot-checkout-session` → Stripe
2. On success → `PaymentSuccess.tsx` (mode `slot`) → inserts `games` + `bookings`, marks slot `is_available=false`
3. `blockConsecutiveSlots()` called by `confirm-slot-booking` to block adjacent 30-min slots

### Private game — split (players share cost)
1. Organizer pays hold = `courtPrice × 1.15` (capture_method = manual)
2. Other players join → each pays their share hold
3. At 12h cutoff → `process-game-transitions` block S captures each player's PI

### Open game
1. Player creates game → `create-checkout-session` → Stripe → `PaymentSuccess.tsx` (mode `open_game`)
2. Others join → each pays their share
3. Auto-cancel rules apply (see below)

### Pay reservation (Playtomic model)
Manager creates booking → `payment_status: 'pending'` → player pays via app.
`PaymentSuccess.tsx` (mode `pay_reservation`) **updates** existing `game_players` row (`paid: true`) + `bookings.payment_status='paid'`. No new insert, no `current_players` increment.

## Fees

- Service fee: **8% + R$2,50** per player
- Use `calcFees(vagaPrice)` from `src/app/lib/checkout.ts`
- Split checkout: `courtPrice × 1.15` total hold

## Player limits

All sports (futsal and society): **min 10, max 18** players.
- Open games: min 10, max 18
- Private games: max chosen by player (up to 18)

## Cutoffs

| Rule | Value |
|------|-------|
| Cancel cutoff | 12h before start (`PLAYER_CANCEL_CUTOFF_HOURS` in gameConfig.ts) |
| Join cutoff | 15min before start (hardcoded in OpenGamePage.tsx) |
| Unpaid reservation expiry | 2h after creation (cron block -2) |

## Auto-cancel rules (cron — runs every minute)

`process-game-transitions` blocks:

| Block | Trigger | Action |
|-------|---------|--------|
| -2 | 2h before, unpaid reservation | Cancel game + booking, free slot, notify player |
| -1 | fill ≤20% at 6h / ≤40% at 4h / <100% at 2h | Cancel open game, free slot, notify all |
| S | 12h before start | Capture each player's Stripe PI (split payment) |
| 0 | At game start | Transition to `pending_results` |
| 1 | 5min after end | Prompt MVP vote |
| 2 | 12h after end | Auto-complete if no vote |

## Edge Functions

| Function | Auth | Purpose |
|----------|------|---------|
| `confirm-slot-booking` | JWT (userId from token) | Creates booking + game after slot payment; calls `blockConsecutiveSlots()` |
| `create-slot-checkout-session` | JWT (userId from token) | Stripe session for private booking; price from `slots.price_override` or `courts.price_per_hour` |
| `create-checkout-session` | JWT (playerId from token) | Stripe session for open game join; price from `games.price_per_player` |
| `cancel-booking` | JWT (must be booking.created_by or venue admin) | Cancels booking, frees slot range `[start_time, scheduled_end_at)` |
| `cancel-game` | JWT (must be venues.admin_id) | Cancels game, frees slot range |
| `stripe-webhook` | Stripe Signature (no JWT) | Handles all Stripe events; always returns 200 |
| `create-manual-booking` | Service Role | Manager creates booking; inserts games + game_players |
| `process-game-transitions` | Cron (no auth) | Auto-cancel, status transitions, split capture |
| `get-stripe-session` | JWT | Resolves Stripe sessionId → paymentIntentId |

### Deploy rule — CRITICAL
**Always deploy Edge Functions via Supabase Dashboard** (Edge Functions → function → Edit → paste content).
**Never use Supabase CLI** (`supabase functions deploy`).

### Template literals warning
When copying Edge Function code from chat, backticks inside template literals (`` ` ``) may be corrupted by markdown rendering. Restore manually before deploying.

## Consecutive slot blocking

Sessions are 90 or 120min but slots are 30min granularity.
`blockConsecutiveSlots()` in `confirm-slot-booking` uses service role to do a range update:
`.gte('start_time', slotStart).lt('start_time', sessionEnd)` → `is_available = false`

Called on both normal path AND idempotent return path.
Equivalent range-free on cancel (both `cancel-booking` and `cancel-game`).

## Frontend patterns

### fetchAllRef / fetchSlotsRef
Realtime subscriptions capture a stale closure of the fetch function. Fix:
```typescript
const fetchAllRef = useRef(fetchAll);
fetchAllRef.current = fetchAll; // updated on every render
// subscription uses: fetchAllRef.current()
```
Applied in: `SmartBookingCalendar.tsx`, `CourtDetails.tsx`

### generateFromPreCreatedSlots (CourtDetails)
DB pre-created slots are the **single source of truth** for the player view.
- Iterates `futureSlots` (ALL future slots, not just `is_available=true`)
- Uses real `slot.id` (not `dyn_` prefix) and `isDynamic: false`
- Deleted slots disappear automatically via realtime + `fetchSlotsRef`
- Blocked slots appear greyed via `bookedIntervals` (conflicts90/120)

## Security

### JWT (Edge Functions)
Mandatory on 5 critical functions. `userId` / `playerId` always comes from the token, never from the request body.

### Stripe Webhook
Verified via `stripe.webhooks.constructEventAsync()` with `STRIPE_WEBHOOK_SECRET`.
JWT disabled on this function (auth is the Stripe signature).
Always returns 200 to prevent Stripe retries.

### Gestor access guard
`GestorApp.tsx`: unauthenticated → LoginPage; authenticated but no venue → "Acesso restrito"; authenticated with venue → full app.
Signup removed from gestor LoginPage — onboarding is manual only.

### RLS
All tables have RLS. Operations that need to bypass (e.g. `blockConsecutiveSlots`) use `SUPABASE_SERVICE_ROLE_KEY`.

## Stripe configuration

- Account: "JoggaHub" (`acct_1TJ8ksBgWEz6hyBy`)
- Mode: **test mode** (live mode pending identity verification)
- Payment methods: `['card']` only — PIX code ready but disabled until live mode
- Webhook: legacy endpoint `we_1TWF6iBgWEz6hyBycG0J0GC2` (test mode)
- ⚠️ Identity verification done (CPF, ID, address BR) — check if live mode is released

## Running locally

```bash
npm install
npm run dev
```

`.env` required (never commit):
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_STRIPE_PUBLISHABLE_KEY=
```

Edge Functions env vars are set in the Supabase Dashboard.

## Gestor manual onboarding

1. Supabase Dashboard → Authentication → Users → "Add user" → email + password → copy UUID
2. Table Editor → `venues` → Insert row → `admin_id = UUID` → copy `id`
3. Table Editor → `courts` → Insert row → `venue_id` → fill data
4. Send credentials to manager (email + password + link `/gestor`)

## Next steps (as of 2026-05-17)

- **Live mode Stripe**: create webhook in live mode + update secrets in Supabase + swap `VITE_STRIPE_PUBLISHABLE_KEY` in Vercel
- **PIX**: reactivate after live mode (`['card', 'pix']` in both checkout functions) — code ready
- **Consecutive blocking for open games**: only block after min players reached, not on individual join — not yet implemented
- **`/admin` page**: protected by `user.id === AARON_ID` for manager onboarding via form (when 5+ venues)
- **Email confirmations**: Supabase Auth templates + custom SMTP via Resend
