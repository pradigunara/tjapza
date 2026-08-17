# Tjapza 🎴

> Realtime 4-Player **Capsa Banting (Big Two)** Card Game  
> **Backend**: PocketBase (Goja ES5 hooks + SSE realtime) · **Frontend**: PixiJS v8 + Vite + TypeScript + Web Audio API.

---

## Features

- 🃏 **Complete Capsa Banting Rules Engine**: 52-card standard deck, ascending 10-straight hierarchy (`A-2-3-4-5` to `J-Q-K-A-2`), rank-first flush comparison, 5-card combo hierarchy (`Straight Flush > Quads > Full House > Flush > Straight`), and mandatory 3♦ opener.
- 🤖 **Deterministic Greedy Bot AI**: Smart heuristics that conserve high cards ($\ge$ K, 2s) unless in late-game danger ($\le$ 3 cards), lead combos first, and play minimal winning combinations.
- ⚡ **Authoritative Realtime State**: Server-side rule validation, private hand isolation (`user_id = @request.auth.id`), atomic database transactions, dynamic host ticker failover, and anti-griefing timeout protection.
- 🎨 **PixiJS v8 Vector Table**: Crisp vector-rendered cards, curved bottom hand fan with drag/click selection and keyboard shortcuts (`Space` to Play, `P` to Pass, `H` to Hint, `D` to Clear, `S` to Sort), active turn glow rings, and procedural Web Audio synthesizers.
- 🌐 **Multiplayer & Matchmaking**: 6-character private friend rooms with shareable invite links, public quickplay queue, and 30s post-game rematch flow.

---

## Project Layout

```
tjapza/
├─ pb/
│  ├─ pb_migrations/            # Schema migrations (users, games, hands, moves, results)
│  ├─ pb_hooks/
│  │  ├─ cards.js               # Isomorphic ES5 rules engine & bot AI (Goja runtime)
│  │  └─ main.pb.js             # Move validator, room endpoints, rematch, trick loop
│  └─ pb_public/                # Production web assets served by PocketBase
├─ web/
│  ├─ src/
│  │  ├─ audio/sound.ts         # Procedural Web Audio synthesizer
│  │  ├─ net/pb.ts              # PocketBase client, SSE listeners, host heartbeat
│  │  ├─ render/                # CardSprite, HandFan, PileView, SeatView
│  │  ├─ rules/cards.ts         # Isomorphic TypeScript rules engine
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

### 2. Install & Build Frontend
```bash
cd web
bun install
bun run build
```

### 3. Start Backend Server
```bash
./pb/pocketbase serve
```
Open **`http://127.0.0.1:8090`** in your browser to play immediately!

---

## Testing

```bash
# Run unit test suite (58 tests across TypeScript & ES5 engines)
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
