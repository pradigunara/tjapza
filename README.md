# Tjapza 🎴

> Realtime 4-Player **Capsa Banting (Big Two)** Card Game  
> **Backend**: PocketBase (Goja ES5 hooks + SSE realtime) · **Frontend**: PixiJS v8 + Vite + TypeScript + Web Audio API.

---

## Features

- 🃏 **Complete Capsa Banting Rules Engine**: 52-card standard deck, ascending 10-straight hierarchy (`A-2-3-4-5` to `J-Q-K-A-2`), rank-first flush comparison, 5-card combo hierarchy (`Straight Flush > Quads > Full House > Flush > Straight`), and mandatory 3♦ opener.
- 🤖 **Deterministic Greedy Bot AI**: Smart heuristics that conserve high cards ($\ge$ K, 2s) unless in late-game danger ($\le$ 3 cards), lead combos first, and play minimal winning combinations.
- ⚡ **Authoritative Realtime State**: Server-side rule validation, private hand isolation (`user_id = @request.auth.id`), atomic database transactions, dynamic host ticker failover, and anti-griefing timeout protection.
- 🎨 **PixiJS v8 Vector Table**: Crisp vector-rendered cards, curved bottom hand fan with drag/click selection and keyboard shortcuts (`Space` to Play, `P` to Pass, `H` to Hint, `D` to Clear), active turn glow rings, and procedural Web Audio synthesizers.
- 🌐 **Multiplayer & Matchmaking**: 6-character private friend rooms with shareable invite links, public quickplay queue, and 30s post-game rematch flow.

---

## Project Layout

```
tjapza/
├─ pb/
│  ├─ pb_migrations/            # Schema migrations (users, games, hands, moves, results)
│  ├─ pb_hooks/
│  │  ├─ domain.js              # Bundled ES5 rules engine & bot AI (Goja runtime)
│  │  ├─ game_service.js        # Deal, DTO↔domain, hand lookup, cleanup
│  │  └─ main.pb.js             # Move validator, room endpoints, rematch, trick loop
│  └─ pb_public/                # Production web assets served by PocketBase
├─ web/
│  ├─ src/
│  │  ├─ application/           # GameController, heartbeat, table SSE sync
│  │  ├─ audio/sound.ts         # Procedural Web Audio synthesizer
│  │  ├─ domain/                # Capsa Banting rules, Trick, BotEngine
│  │  ├─ net/pb.ts              # PocketBase client, SSE listeners
│  │  ├─ render/                # CardSprite, HandFan, PileView, SeatView
│  │  ├─ scenes/                # LobbyScene, TableScene, ResultsScene
│  │  └─ main.ts                # App entrypoint & scene routing
│  ├─ package.json
│  └─ vite.config.ts
├─ scripts/
│  ├─ test_e2e.ts               # Full 4-player game E2E test
│  ├─ test_edge_cases.ts        # Security, anti-cheat, and host failover tests
│  └─ stress_test_100_games.ts  # 100-game Monte Carlo simulation test
└─ PLAN.md                      # System architecture and design specification
```

---

## Quick Start

### 1. Prerequisites
- [Bun](https://bun.sh/) (or Node.js 18+)
- [PocketBase](https://pocketbase.io/) (v0.25+) binary placed in `pb/pocketbase`

### 2. Live Development (Vite HMR + PocketBase)
Run the all-in-one development script from the project root:
```bash
./dev.sh
```
This automatically bundles domain hooks, boots PocketBase on `http://127.0.0.1:8090`, and starts the Vite live dev server on `http://localhost:3000`.

### 3. Production Build & Full-Stack Run
```bash
cd web
bun install && bun run build
cd ..
./pb/pocketbase serve
```
Open **`http://127.0.0.1:8090`** in your browser to play!

---

## Testing

```bash
# Run unit test suite (112 tests across TypeScript & ES5 engines)
bun test

# Run End-to-End integration test
bun run scripts/test_e2e.ts

# Run 100-game Monte Carlo stress test
bun run scripts/stress_test_100_games.ts

# Run edge cases and anti-cheat test suite
bun run scripts/test_edge_cases.ts
```

---

## License
MIT
