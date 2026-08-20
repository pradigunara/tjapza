# Tjapza

> Realtime 4-player **Capsa Banting (Big Two)** card game.
> Backend: PocketBase v0.39 (authoritative state + realtime SSE) · Frontend: PixiJS v8 + Vite + TypeScript.

---

## 1. Overview

Tjapza is a realtime, multiplayer Capsa Banting (Big Two) card game for 4 seats.
PocketBase acts as the authoritative backend (state, rule validation, persistence, and SSE realtime events);
PixiJS v8 renders the table; Vite + vanilla TypeScript form the client.
Empty seats are filled by deterministic bots so a game can always start, and disconnected players are
stood in by bots to completion.

---

## 2. Stack & Architecture

- **Backend**: PocketBase v0.39 — prebuilt binary with ES5 JS hooks (goja), SSE realtime subscriptions. Self-hosted VPS behind Caddy (automatic TLS).
- **Frontend**: PixiJS v8 (WebGPU-first with WebGL fallback), Vite, vanilla TypeScript, `pocketbase/js-sdk`, Web Audio API.
- **Auth**: Google OAuth2 on PocketBase's built-in `users` collection; `display_name` field editable later.

---

## 3. Game Rules Engine (Capsa Banting / Big Two)

### Card Representation
- 52-card standard deck, 13 cards dealt to each of the 4 seats.
- **Rank hierarchy**: `2 > A > K > Q > J > 10 > 9 > 8 > 7 > 6 > 5 > 4 > 3`.
- **Suit hierarchy**: `♠ (Spades) > ♥ (Hearts) > ♣ (Clubs) > ♦ (Diamonds)`.
- **Numeric encoding**:
  - `rank`: `0..12` (`0 = 3, 1 = 4, ..., 11 = A, 12 = 2`).
  - `suit`: `0..3` (`0 = ♦, 1 = ♣, 2 = ♥, 3 = ♠`).
  - `code = rank * 4 + suit` (integer `0..51`).

### Opening Play
- The holder of **3♦** (`code = 0`) must open the first trick of the game.
- The opening combo **must include 3♦** (single 3♦, pair containing 3♦, or 5-card combo containing 3♦).

### Legal Combinations
1. **Single**: 1 card. Compared by rank, then suit.
2. **Pair**: 2 cards of identical rank. Compared by rank, then highest suit in the pair.
3. **5-Card Combos** (Hierarchical beating order: `Straight Flush > Four of a Kind > Full House > Flush > Straight`):
   - **Straight**: 5 consecutive cards.
     - **10 Valid Straights** (in ascending power order):
       1. `A-2-3-4-5` (Lowest straight; top determining card is **5**).
       2. `3-4-5-6-7` (Top card 7).
       3. `4-5-6-7-8` (Top card 8).
       4. `5-6-7-8-9` (Top card 9).
       5. `6-7-8-9-10` (Top card 10).
       6. `7-8-9-10-J` (Top card J).
       7. `8-9-10-J-Q` (Top card Q).
       8. `9-10-J-Q-K` (Top card K).
       9. `10-J-Q-K-A` (Top card A).
       10. `J-Q-K-A-2` (Highest straight; top determining card is **2**).
     - *Note*: `2-3-4-5-6` and `Q-K-A-2-3` are **invalid**.
     - Comparison: compare top card rank; if tied, compare top card suit.
   - **Flush**: 5 cards of the same suit.
     - Comparison: Rank-first (Poker-standard). Compare highest card rank (`2 > A > K ...`); if tied, compare suit of that highest card.
   - **Full House**: 3 of a kind + 1 pair.
     - Comparison: Rank of the 3-of-a-kind.
   - **Four of a Kind (Quads)**: 4 cards of identical rank + 1 kicker card.
     - Comparison: Rank of the 4-of-a-kind.
   - **Straight Flush**: 5 consecutive cards of the same suit (same 10 valid straights).
     - Comparison: Top card rank, then suit.
4. **No standalone triples. No standalone bombs** (Quads and Straight Flushes are played as 5-card combos in turn rotation).

### Play, Passing, and Trick Lifecycle
- **Beat rule**:
  - Singles only beat Singles (higher power).
  - Pairs only beat Pairs (higher power).
  - Any 5-card combo can be beaten by:
    1. A higher 5-card category (e.g. Flush beats Straight, Full House beats Flush, Quads beats Full House, Straight Flush beats Quads).
    2. A higher combo within the same category (e.g. higher Full House beats lower Full House).
- **Passing**: Allowed at any time except the initial 3♦ opening move. A pass locks the player out for the remainder of the current trick; they re-enter play when the trick is cleared and a fresh lead begins.
- **Pile Reset (Trick Cleared)**:
  - When all other active players pass consecutively (`pass_count == active_players - 1`), the trick ends.
  - The trick winner leads a fresh combo of any legal type.
- **Post-Shed Lead Priority**:
  - If a player sheds their last card and wins the trick (all remaining players pass), the right to lead the fresh trick passes to the **next active player clockwise** from the winner.
- **Going Out & Ranking**:
  - No restriction on winning cards (players may finish on a 2).
  - When a player empties their hand, they are assigned the next available rank (1st, 2nd, 3rd) and leave the turn rotation.
  - The game ends immediately when only 1 player holds cards (that player takes 4th place).

---

## 4. Turns, Heartbeat & Bot AI

### Game Loop & Heartbeat Architecture
- **Client-Driven Heartbeat with Dynamic Host Failover**:
  - The connected player with the lowest active seat index acts as the room ticker / host.
  - The host client sends periodic ticks (`POST` move with `action: "tick"`) every 1–2s when it is a bot's turn or to check the 60s turn timer.
  - If the host disconnects, the next active human seat automatically detects the missing tick and assumes host duties.
  - If all humans disconnect, the game pauses in place until reconnection, or auto-forfeits on timeout.
- **60s Turn Timer**:
  - Server records `turn_started_at`.
  - If 60s elapses on a human seat, the server auto-plays via the bot heuristic on the next tick/action.

### Bot Heuristic AI
- Deterministic, seeded RNG per game.
- **Greedy minimal-resource strategy**:
  - **Leading**: Lead lowest 5-card combo > lowest pair > lowest single (excluding 2s).
  - **Beating**: Play the lowest legal combo that beats the pile.
  - **Resource Conservation**: Avoid breaking pairs/trips or playing cards $\ge$ K / 2s unless in endgame (an opponent holds $\le$ 3 cards).

---

## 5. Matchmaking, Rooms & Rematch

- **Friend Rooms**:
  - Shareable 6-character uppercase alphanumeric code.
  - Host starts the game once $\ge$ 1 human is seated; remaining seats are filled with bots.
  - Mid-game joins are blocked; no spectating.
- **Public Quick-Play**:
  - In-table matching on `games` collection (`is_public = true && status = 'waiting'`).
  - First player creates room; a 30s countdown is shown. Any seated player may force-start with bots once it expires; the host may start earlier. When a 4th human joins, the deal triggers immediately.
- **Rematch Lifecycle**:
  - On game completion, players receive a 30s rematch prompt.
  - Unanimous accept creates a **brand new `games` record** with the same room code / seated players, preserving old game records and `results` immutably.

---

## 6. Data Model & PocketBase Hooks

### PocketBase Collections

| Collection | Key Fields | View Rule | Write Rule |
| :--- | :--- | :--- | :--- |
| `users` | `id`, `email`, `display_name`, `avatar` | `@request.auth.id != ""` | `@request.auth.id = id` |
| `games` | `status` (`'waiting'`, `'playing'`, `'finished'`), `seats[4]`, `turn_index`, `leader_index`, `last_combo`, `pass_count`, `counts[4]`, `turn_started_at`, `winner_ranks[]`, `room_code`, `is_public`, `created` | `@request.auth.id != ""` | Hooks only |
| `hands` | `game_id`, `user_id`, `seat_index`, `cards[]` | `user_id = @request.auth.id` | Hooks only |
| `moves` | `game_id`, `seat_index`, `action` (`'play'`, `'pass'`, `'tick'`), `cards[]`, `combo_type`, `combo_power`, `created` | Seated game participants | Hooks only |
| `results` | `game_id`, `user_id`, `seat_index`, `rank` (1..4), `is_bot`, `created` | `@request.auth.id != ""` | Hooks only |

### Authoritative Hook Pattern (`onRecordCreateRequest('moves')`)
- Human move: Client creates a `moves` record with played cards. The hook verifies turn, hand ownership, combo legality, and power over `last_combo`.
- Bot / Timer tick: Host client submits `{ action: "tick", game_id: ... }`. The hook verifies it is indeed a bot's turn (or timer expired), runs the server-side bot AI, replaces record fields with the chosen play/pass, and applies state mutations atomically in a transaction.

---

## 7. Frontend & Rendering (PixiJS v8)

- **PixiJS v8 Canvas**: WebGPU-first with WebGL fallback. Procedural vector cards + rank/suit text.
- **Layout**:
  - Bottom: Player hand (fanned, sorted by power ascending, tap-to-lift selection).
  - Top / Left / Right: Opponents (card backs, remaining count, name, active turn glow/timer).
  - Center: Trick pile (`last_combo` display + pass indicators).
- **Responsive**: Landscape-optimized, mobile portrait supported, $\ge$ 44px touch targets.
- **Audio & Animations**:
  - Smooth card translation/tweens from hand/seats to center pile.
  - Web Audio synthesis / sound effects: deal flutter, card snap/thud, turn chime, countdown urgency, win/loss cues.

---

## 8. Project Layout

```
tjapza/
├─ pb/
│  ├─ pocketbase                # prebuilt binary
│  ├─ pb_migrations/            # schema definitions (users, games, hands, moves, results)
│  ├─ pb_hooks/
│  │  ├─ main.pb.js             # move interceptor, deal hook, tick resolver, rematch
│  │  ├─ game_service.js        # deal, DTO↔domain, hand lookup, cleanup
│  │  └─ domain.js              # ES5 rules engine & bot AI (built from web/src/domain)
│  └─ pb_public/                # built Vite SPA served by PocketBase
└─ web/
   ├─ index.html
   ├─ src/
   │  ├─ main.ts                # App entry & Pixi stage bootstrap
   │  ├─ application/           # GameController, heartbeat, table SSE sync
   │  ├─ net/pb.ts              # PocketBase SDK, auth, SSE subscriptions
   │  ├─ domain/                # TypeScript rules engine (source of domain.js)
   │  ├─ audio/sound.ts         # Web Audio sound effects
   │  ├─ scenes/                # LobbyScene, TableScene, ResultsScene
   │  ├─ render/                # CardSprite, HandFan, PileView, SeatView
   │  └─ ui/                    # Action buttons, turn timer, toast notifications
   └─ vite.config.ts
```

---

## 9. Implementation Milestones

- **M1: Foundation & Auth** — PocketBase schema migrations, Google OAuth2, Lobby & Room creation/joining.
- **M2: Rules Engine & Bot AI** — Unit-tested isomorphic Capsa Banting rules engine (`web/src/domain` / `pb_hooks/domain.js`) & deterministic bot heuristic.
- **M3: Authoritative Game Loop** — Dealing, `moves` record hooks, client-driven heartbeat with host failover, 120s timer, trick shedding & rank-out.
- **M4: PixiJS Table & Realtime UX** — Table view, card fanning, tap-to-lift, SSE reconciliation, tweens, turn countdown.
- **M5: Polish & Hardening** — Web Audio sound effects, Rematch flow, player stats/profile, mobile touch tuning, Caddy deployment setup.
