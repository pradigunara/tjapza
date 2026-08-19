import { spawn, type ChildProcess } from "child_process";
import PocketBase from "../web/node_modules/pocketbase";
import { CardCombo, BotEngine, Hand, Trick } from "../web/src/domain";

const PB_PORT = 8098;
const PB_URL = `http://127.0.0.1:${PB_PORT}`;
const PB_DIR = "./pb/test_pb_edge_data";

async function runEdgeCasesSuite() {
  console.log("🛡️ Starting Comprehensive Edge Cases & Security Test Suite...");

  const server: ChildProcess = spawn(
    "./pb/pocketbase",
    ["serve", `--http=127.0.0.1:${PB_PORT}`, `--dir=${PB_DIR}`],
    { stdio: "pipe" }
  );

  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${PB_URL}/api/health`);
      if (res.ok) break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  console.log("✅ PocketBase server running on " + PB_URL);

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Security & Rule Boundary Verification
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 1: Security & Anti-Cheat Validation ---");
    const pb1 = new PocketBase(PB_URL);
    const pb2 = new PocketBase(PB_URL);

    const email1 = `edge1_${Date.now()}@tjapza.local`;
    const password = "Password123!";
    await pb1.collection("users").create({
      email: email1,
      password: password,
      passwordConfirm: password,
      display_name: "Alice",
    });
    await pb1.collection("users").authWithPassword(email1, password);

    const email2 = `edge2_${Date.now() + 1}@tjapza.local`;
    await pb2.collection("users").create({
      email: email2,
      password: password,
      passwordConfirm: password,
      display_name: "Bob",
    });
    await pb2.collection("users").authWithPassword(email2, password);

    // Alice creates room, Bob joins
    const roomRes = await pb1.send("/api/tjapza/room/create", {
      method: "POST",
      body: { is_public: false },
    });
    const gameId = roomRes.game.id;
    await pb2.send("/api/tjapza/room/join", {
      method: "POST",
      body: { room_code: roomRes.game.room_code },
    });

    // Start game
    const started = await pb1.send("/api/tjapza/room/start", {
      method: "POST",
      body: { game_id: gameId },
    });
    let game = started.game;
    console.log("✅ 2-Player Game Started. Seated:", game.seats.map((s: any) => s?.name));

    // A. Unauthorized Hand Reading Test
    // Bob tries to read Alice's hand record
    let unauthHandFailed = false;
    try {
      await pb2.collection("hands").getFirstListItem(`game_id = "${gameId}" && user_id = "${pb1.authStore.record?.id}"`);
    } catch (err: any) {
      unauthHandFailed = true;
      console.log("✅ Anti-Cheat Passed: Opponent cannot read private hand data (HTTP 404/403)");
    }
    if (!unauthHandFailed) {
      throw new Error("SECURITY FAILURE: Player was able to read opponent hand record!");
    }

    // B. Playing Out of Turn Test
    const notTurnPlayer = game.turn_index === 0 ? pb2 : pb1;
    const notTurnSeat = game.turn_index === 0 ? 1 : 0;
    let outOfTurnFailed = false;
    try {
      await notTurnPlayer.collection("moves").create({
        game_id: game.id,
        seat_index: notTurnSeat,
        action: "play",
        cards: [0],
      });
    } catch (err) {
      outOfTurnFailed = true;
      console.log("✅ Turn Validation Passed: Out-of-turn move rejected");
    }
    if (!outOfTurnFailed) {
      throw new Error("RULE FAILURE: Player was able to move out of turn!");
    }

    // C. Playing Unowned Cards Test
    const turnSeat = game.turn_index;
    const turnPlayer = turnSeat === 0 ? pb1 : pb2;
    if (turnSeat === 0 || turnSeat === 1) {
      const myHand = await turnPlayer.collection("hands").getFirstListItem(
        `game_id = "${game.id}" && user_id = "${turnPlayer.authStore.record?.id}"`
      );
      // Pick a card code NOT in player's hand
      const allCards = Array.from({ length: 52 }, (_, i) => i);
      const unownedCard = allCards.find((c) => !myHand.cards.includes(c))!;

      let unownedCardFailed = false;
      try {
        await turnPlayer.collection("moves").create({
          game_id: game.id,
          seat_index: turnSeat,
          action: "play",
          cards: [unownedCard],
        });
      } catch (err) {
        unownedCardFailed = true;
        console.log("✅ Card Ownership Passed: Attempt to play unowned card rejected");
      }
      if (!unownedCardFailed) {
        throw new Error("RULE FAILURE: Player played a card not in their hand!");
      }
    }

    // -------------------------------------------------------------------------
    // TEST 2: Disconnect & Anti-Griefing Human Timeout Protection
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 2: Anti-Griefing & Human Timeout Protection ---");
    // Seat → client map from the actual room seating (Alice seat 0, Bob seat 1)
    const clientBySeat: Record<number, PocketBase> = {};
    for (let i = 0; i < 4; i++) {
      const uid = game.seats[i]?.user_id;
      if (!uid) continue;
      if (uid === pb1.authStore.record?.id) clientBySeat[i] = pb1;
      else if (uid === pb2.authStore.record?.id) clientBySeat[i] = pb2;
    }

    const snap = (g: any) => JSON.stringify({
      status: g.status,
      turn_index: g.turn_index,
      counts: g.counts,
      last_combo: g.last_combo ?? null,
      pass_count: g.pass_count ?? 0,
      passed_seats: g.passed_seats ?? [],
      turn_started_at: g.turn_started_at,
    });

    // Step 1 — reach an active human turn (the opener may be a bot). Every bot
    // tick must resolve AND advance state; this doubles as the bot-stall
    // regression: a 2xx tick that mutates nothing is a stall.
    let warmupTicks = 0;
    while (game.seats[game.turn_index]?.is_bot && warmupTicks < 60) {
      const pre = snap(game);
      await pb1.collection("moves").create({
        game_id: game.id,
        seat_index: game.turn_index,
        action: "tick",
        cards: [],
      });
      const next = await pb1.collection("games").getOne(game.id);
      if (snap(next) === pre) {
        throw new Error(`STALL: bot tick #${warmupTicks + 1} returned 2xx but state did not advance`);
      }
      game = next;
      warmupTicks++;
    }
    if (game.seats[game.turn_index]?.is_bot) {
      throw new Error("INCONCLUSIVE: bot ticks never reached a human turn (stall!)");
    }
    if (game.status !== "playing") {
      throw new Error("INCONCLUSIVE: game ended before reaching a human turn");
    }
    console.log(`✅ Bot turns advanced cleanly after ${warmupTicks} tick(s)`);

    // Step 2 — while it is a human turn, a premature tick from ANOTHER seated
    // human must be a strict no-op: accepted (idempotent heartbeat), never
    // mutates game state or the hand, and never persists a move record.
    const activeSeat = game.turn_index as number;
    const turnUser = clientBySeat[activeSeat];
    const otherUser = Object.entries(clientBySeat).find(([s]) => Number(s) !== activeSeat)?.[1];
    if (!turnUser || !otherUser) {
      throw new Error("INCONCLUSIVE: expected two seated humans for the no-op probe");
    }
    const handBefore = await turnUser.collection("hands").getFirstListItem(
      `game_id = "${game.id}" && user_id = "${turnUser.authStore.record?.id}"`
    );
    const before = snap(game);
    const movesBefore = await pb1.collection("moves").getFullList({ filter: `game_id = "${game.id}"` });

    const tickResp = await otherUser.collection("moves").create({
      game_id: game.id,
      seat_index: activeSeat,
      action: "tick",
      cards: [],
    });

    const afterTick = await pb1.collection("games").getOne(game.id);
    const handAfter = await turnUser.collection("hands").getFirstListItem(
      `game_id = "${game.id}" && user_id = "${turnUser.authStore.record?.id}"`
    );
    const movesAfter = await pb1.collection("moves").getFullList({ filter: `game_id = "${game.id}"` });

    if (snap(afterTick) !== before) {
      throw new Error("SECURITY FAILURE: Premature tick mutated an active human's game state!");
    }
    if (JSON.stringify(handAfter.cards) !== JSON.stringify(handBefore.cards)) {
      throw new Error("SECURITY FAILURE: Premature tick mutated an active human's hand!");
    }
    // No-op ticks must not persist ANY record (inert or otherwise)
    if (movesAfter.length !== movesBefore.length) {
      throw new Error(`SECURITY FAILURE: Premature tick persisted a record (${movesAfter.length - movesBefore.length} new)!`);
    }
    if (tickResp && typeof tickResp === "object" && (tickResp.action === "play" || tickResp.action === "pass")) {
      throw new Error("SECURITY FAILURE: Tick was rewritten into an effective move!");
    }
    console.log("✅ Anti-Griefing Passed: Premature bot-tick on active human seat is an idempotent no-op");

    // -------------------------------------------------------------------------
    // TEST 3: Host Failover & 2-Human Game Completion to Podium
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 3: 2-Human Multi-Round Game to Podium ---");
    let turnsCount = 0;
    while (game.status === "playing" && turnsCount < 200) {
      turnsCount++;
      const currentTurn = game.turn_index;
      const isAlice = currentTurn === 0;
      const isBob = currentTurn === 1;

      if (isAlice || isBob) {
        const client = isAlice ? pb1 : pb2;
        const handRec = await client.collection("hands").getFirstListItem(
          `game_id = "${game.id}" && user_id = "${client.authStore.record?.id}"`
        );
        const cards: number[] = handRec.cards || [];
        const isOpening = !game.last_combo && game.counts.every((c: number) => c === 13);
        const trick = game.last_combo?.cards?.length > 0
          ? new Trick({ lastCombo: CardCombo.evaluate(game.last_combo.cards) })
          : Trick.createFresh(currentTurn);

        const decision = BotEngine.decideMove({
          hand: new Hand(cards),
          trick: trick,
          isOpeningMove: isOpening,
          counts: game.counts
        });

        if (decision.action === "play" && decision.cards.length > 0) {
          const combo = CardCombo.evaluate(decision.cards);
          console.log(`[Move ${turnsCount}] 👤 ${isAlice ? "Alice" : "Bob"} PLAY:`, combo?.type, decision.cards.map((c) => c.code));
          await client.collection("moves").create({
            game_id: game.id,
            seat_index: currentTurn,
            action: "play",
            cards: decision.cards.map((c) => c.code),
          });
        } else {
          console.log(`[Move ${turnsCount}] 👤 ${isAlice ? "Alice" : "Bob"} PASS`);
          await client.collection("moves").create({
            game_id: game.id,
            seat_index: currentTurn,
            action: "pass",
            cards: [],
          });
        }
      } else {
        // Dynamic Host Failover test: Alternating tickers between Alice and Bob!
        const ticker = turnsCount % 2 === 0 ? pb1 : pb2;
        const botMove = await ticker.collection("moves").create({
          game_id: game.id,
          seat_index: currentTurn,
          action: "tick",
          cards: [],
        });
        console.log(`[Move ${turnsCount}] 🤖 Bot Seat ${currentTurn} ${botMove.action.toUpperCase()}:`, botMove.combo_type || "");
      }

      game = await pb1.collection("games").getOne(game.id);
    }

    if (game.status !== "finished") {
      throw new Error("Multiplayer game did not finish!");
    }

    console.log("🎉 2-Player Game Finished successfully!");
    const results = await pb1.collection("results").getList(1, 10, {
      filter: `game_id = "${game.id}"`,
      sort: "rank",
    });
    results.items.forEach((r) => {
      console.log(`   Rank #${r.rank}: ${game.seats[r.seat_index].name} (${r.is_bot ? "Bot" : "Human"})`);
    });

    console.log("\n========================================================");
    console.log("🛡️ ALL ADVANCED EDGE CASE & SECURITY TESTS PASSED 100%! 🛡️");
    console.log("========================================================\n");
  } finally {
    server.kill();
  }
}

runEdgeCasesSuite().catch((err) => {
  console.error("❌ Edge case test failed:", err);
  process.exit(1);
});
