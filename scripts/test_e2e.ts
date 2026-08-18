import { spawn, type ChildProcess } from "child_process";
import PocketBase from "../web/node_modules/pocketbase";
import { CardCombo, BotEngine, Hand, Trick } from "../web/src/domain";

const PB_PORT = 8095;
const PB_URL = `http://127.0.0.1:${PB_PORT}`;
const PB_DIR = "./pb/test_pb_data";

async function runE2E() {
  console.log("🚀 Starting End-to-End Tjapza Game Test...");

  // 1. Start PocketBase server
  const server: ChildProcess = spawn(
    "./pb/pocketbase",
    ["serve", `--http=127.0.0.1:${PB_PORT}`, `--dir=${PB_DIR}`],
    { stdio: "pipe" }
  );

  server.stdout?.on("data", (data) => {
    console.log("[PB]", data.toString().trim());
  });
  server.stderr?.on("data", (data) => {
    console.error("[PB ERR]", data.toString().trim());
  });

  // Wait for server to boot
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${PB_URL}/api/health`);
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  if (!ready) {
    server.kill();
    throw new Error("Failed to start PocketBase test server");
  }

  console.log(`✅ PocketBase server started on ${PB_URL}`);

  try {
    // 2. Initialize Client and Authenticate
    const pb = new PocketBase(PB_URL);
    const email = `test_${Date.now()}@tjapza.local`;
    const password = "Password123!";
    const user = await pb.collection("users").create({
      email,
      password,
      passwordConfirm: password,
      name: "Human Player 1",
    });
    await pb.collection("users").authWithPassword(email, password);
    console.log("✅ Authenticated as:", user.name, "id:", pb.authStore.record?.id);

    // 3. Create a room
    const createRes = await pb.send("/api/tjapza/room/create", {
      method: "POST",
      body: { is_public: false },
    });
    const gameId = createRes.game.id;
    const roomCode = createRes.game.room_code;
    console.log("✅ Created Room:", roomCode, `(Game ID: ${gameId})`);

    // 4. Start the game (fills remaining seats with bots)
    const startRes = await pb.send("/api/tjapza/room/start", {
      method: "POST",
      body: { game_id: gameId },
    });
    console.log("✅ Game Started! Initial turn:", startRes.game.turn_index, "Seats:", startRes.game.seats);

    // 5. Game Loop Simulation
    let game = startRes.game;
    let turnCount = 0;
    const maxTurns = 200;

    while (game.status === "playing" && turnCount < maxTurns) {
      turnCount++;
      const currentTurn = game.turn_index;
      const isHuman = game.seats[currentTurn]?.user_id === pb.authStore.record?.id;

      if (isHuman) {
        const handRecord = await pb.collection("hands").getFirstListItem(
          `game_id = "${game.id}" && user_id = "${pb.authStore.record?.id}"`
        );
        const myCards: number[] = handRecord.cards;
        const isOpeningTrick = !game.last_combo && game.counts.every((c: number) => c === 13);

        const move = BotEngine.decideMove({
          hand: new Hand(myCards),
          trick: game.last_combo && game.last_combo.cards?.length > 0
            ? new Trick({ lastCombo: CardCombo.evaluate(game.last_combo.cards) })
            : Trick.createFresh(currentTurn),
          isOpeningMove: isOpeningTrick,
          counts: game.counts,
        });

        if (move.action === "play" && move.cards.length > 0) {
          const moveCards = move.cards.map((c) => c.code);
          const combo = CardCombo.evaluate(moveCards);
          console.log(`[Turn ${turnCount}] 👤 Human Seat ${currentTurn} plays:`, moveCards, combo?.type);
          await pb.collection("moves").create({
            game_id: game.id,
            seat_index: currentTurn,
            action: "play",
            cards: moveCards,
          });
        } else {
          console.log(`[Turn ${turnCount}] 👤 Human Seat ${currentTurn} passes`);
          await pb.collection("moves").create({
            game_id: game.id,
            seat_index: currentTurn,
            action: "pass",
            cards: [],
          });
        }
      } else {
        // Bot turn - send tick
        console.log(`[Turn ${turnCount}] 🤖 Ticking bot for Seat ${currentTurn}...`);
        await pb.collection("moves").create({
          game_id: game.id,
          seat_index: currentTurn,
          action: "tick",
          cards: [],
        });
      }

      // Refresh game state
      game = await pb.collection("games").getOne(game.id);
    }

    if (game.status !== "finished") {
      throw new Error(`Game did not finish within ${maxTurns} turns! Current status: ${game.status}`);
    }

    console.log("🎉 Game Finished successfully!");
    console.log("Winner Ranks:", game.winner_ranks);

    // 6. Verify Results Collection
    const results = await pb.collection("results").getList(1, 10, {
      filter: `game_id = "${game.id}"`,
      sort: "rank",
    });
    console.log(`✅ Results Recorded (${results.items.length} ranks):`);
    results.items.forEach((r) => {
      console.log(`   Rank #${r.rank}: Seat ${r.seat_index} (Bot: ${r.is_bot})`);
    });

    if (results.items.length !== 4) {
      throw new Error(`Expected 4 result records, got ${results.items.length}`);
    }

    // 7. Test Rematch Endpoint & Idempotency
    console.log("🔄 Testing Rematch Creation & Idempotency...");
    const rematchRes1 = await pb.send("/api/tjapza/rematch", {
      method: "POST",
      body: { game_id: game.id },
    });
    console.log(`✅ Rematch created: New Game ID ${rematchRes1.game.id}, Room ${rematchRes1.game.room_code}`);

    // Calling rematch again should return the exact same rematch game ID (idempotency)
    const rematchRes2 = await pb.send("/api/tjapza/rematch", {
      method: "POST",
      body: { game_id: game.id },
    });
    if (rematchRes1.game.id !== rematchRes2.game.id) {
      throw new Error("Rematch must be idempotent and return the same game ID!");
    }
    console.log("✅ Rematch idempotency verified (same game ID returned across duplicate calls)!");

    // Verify original game remains untouched and finished
    const originalGame = await pb.collection("games").getOne(game.id);
    if (originalGame.status !== "finished") {
      throw new Error("Original game was modified during rematch!");
    }
    console.log("✅ Original game record remains immutable!");

    // 8. Test Join Room & Quickplay Endpoints & Host Authorization
    console.log("🔄 Testing Join Room, Host Authorization & Quickplay...");
    const user2Email = `test2_${Date.now()}@tjapza.local`;
    await pb.collection("users").create({
      email: user2Email,
      password: password,
      passwordConfirm: password,
      display_name: "Human Player 2",
    });
    const pb2 = new PocketBase(PB_URL);
    await pb2.collection("users").authWithPassword(user2Email, password);

    // Create a new room with user 1 (Host at Seat 0)
    const joinTestRoom = await pb.send("/api/tjapza/room/create", {
      method: "POST",
      body: { is_public: false },
    });
    // User 2 joins by room_code (Seat 1)
    const joinRes = await pb2.send("/api/tjapza/room/join", {
      method: "POST",
      body: { room_code: joinTestRoom.game.room_code },
    });
    if (joinRes.seat_index !== 1) {
      throw new Error(`Expected joined seat_index 1, got ${joinRes.seat_index}`);
    }
    console.log(`✅ User 2 successfully joined room ${joinTestRoom.game.room_code} at seat ${joinRes.seat_index}`);

    // Verify that Non-Host (User 2) CANNOT start the room (403 Forbidden)
    let nonHostStartFailed = false;
    try {
      await pb2.send("/api/tjapza/room/start", {
        method: "POST",
        body: { game_id: joinTestRoom.game.id },
      });
    } catch (err: any) {
      nonHostStartFailed = (err?.status === 403);
    }
    if (!nonHostStartFailed) {
      throw new Error("Non-host player should be forbidden (403) from starting the room!");
    }
    console.log("✅ Room Host authorization verified (Non-host cannot start room)!");

    // Host (User 1) starts the room successfully
    const hostStartRes = await pb.send("/api/tjapza/room/start", {
      method: "POST",
      body: { game_id: joinTestRoom.game.id },
    });
    if (hostStartRes.game.status !== "playing") {
      throw new Error("Room host should be able to start the game!");
    }
    console.log("✅ Host successfully started the room!");

    // Test Quickplay
    const quickplayRes1 = await pb.send("/api/tjapza/quickplay", {
      method: "POST",
      body: {},
    });
    console.log(`✅ Quickplay 1 created public room: ${quickplayRes1.game.room_code}`);
    const quickplayRes2 = await pb2.send("/api/tjapza/quickplay", {
      method: "POST",
      body: {},
    });
    console.log(`✅ Quickplay 2 joined existing public room: ${quickplayRes2.game.room_code} at seat ${quickplayRes2.seat_index}`);
    if (quickplayRes1.game.id !== quickplayRes2.game.id) {
      throw new Error("Quickplay should match to the same open public room");
    }

    console.log("\n=================================");
    console.log("🌟 ALL END-TO-END TESTS PASSED! 🌟");
    console.log("=================================\n");
  } finally {
    server.kill();
  }
}

runE2E().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
