import { spawn, type ChildProcess } from "child_process";
import PocketBase from "../web/node_modules/pocketbase";
import { classifyCombo, getBotMove } from "../web/src/rules/cards";

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
    console.error("[PB-ERR]", data.toString().trim());
  });

  // Wait for server to become responsive
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
    throw new Error("PocketBase server failed to start on " + PB_URL);
  }
  console.log("✅ PocketBase server started on " + PB_URL);

  try {
    const pb = new PocketBase(PB_URL);

    // 2. Auth as Guest / Test User
    const email = `test_${Date.now()}@tjapza.local`;
    const password = "Password123!";
    const user = await pb.collection("users").create({
      email,
      password,
      passwordConfirm: password,
      display_name: "Human Player 1",
    });
    await pb.collection("users").authWithPassword(email, password);
    console.log("✅ Authenticated as:", user.email, "id:", pb.authStore.record?.id);

    // 3. Create Private Room
    const roomRes = await pb.send("/api/tjapza/room/create", {
      method: "POST",
      body: { is_public: false },
    });
    const gameId = roomRes.game.id;
    const roomCode = roomRes.game.room_code;
    console.log(`✅ Created Room: ${roomCode} (Game ID: ${gameId})`);

    // 4. Start Game
    const startRes = await pb.send("/api/tjapza/room/start", {
      method: "POST",
      body: { game_id: gameId },
    });
    console.log("✅ Game Started! Initial turn:", startRes.game.turn_index, "Seats:", startRes.game.seats);

    // 5. Game Loop until finished
    let game = startRes.game;
    let turnCount = 0;
    const maxTurns = 200;

    while (game.status === "playing" && turnCount < maxTurns) {
      turnCount++;
      const currentTurn = game.turn_index;
      const isHuman = game.seats[currentTurn]?.user_id === pb.authStore.record?.id;

      if (isHuman) {
        // Fetch human hand
        const handRecord = await pb.collection("hands").getFirstListItem(
          `game_id = "${game.id}" && user_id = "${pb.authStore.record?.id}"`
        );
        const myCards: number[] = handRecord.cards;
        const isOpeningTrick = !game.last_combo && game.counts.every((c: number) => c === 13);
        const otherCounts = game.counts.filter((c: number, idx: number) => idx !== currentTurn && c > 0);
        const opponentMinCards = otherCounts.length > 0 ? Math.min(...otherCounts) : 13;

        // Use bot logic or smart combo for human automated move
        const moveCards = getBotMove(myCards, game.last_combo?.cards || game.last_combo, isOpeningTrick, opponentMinCards);

        if (moveCards && moveCards.length > 0) {
          const combo = classifyCombo(moveCards);
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

    // 7. Test Rematch Endpoint
    console.log("🔄 Testing Rematch Creation...");
    const rematchRes = await pb.send("/api/tjapza/rematch", {
      method: "POST",
      body: { game_id: game.id },
    });
    console.log(`✅ Rematch created: New Game ID ${rematchRes.game.id}, Room ${rematchRes.game.room_code}`);

    // Verify original game remains untouched and finished
    const originalGame = await pb.collection("games").getOne(game.id);
    if (originalGame.status !== "finished") {
      throw new Error("Original game was modified during rematch!");
    }
    console.log("✅ Original game record remains immutable!");

    // 8. Test Join Room & Quickplay Endpoints
    console.log("🔄 Testing Join Room & Quickplay Endpoints...");
    const user2Email = `test2_${Date.now()}@tjapza.local`;
    await pb.collection("users").create({
      email: user2Email,
      password: password,
      passwordConfirm: password,
      display_name: "Human Player 2",
    });
    const pb2 = new PocketBase(PB_URL);
    await pb2.collection("users").authWithPassword(user2Email, password);

    // Create a new room with user 1
    const joinTestRoom = await pb.send("/api/tjapza/room/create", {
      method: "POST",
      body: { is_public: false },
    });
    // User 2 joins by room_code
    const joinRes = await pb2.send("/api/tjapza/room/join", {
      method: "POST",
      body: { room_code: joinTestRoom.game.room_code },
    });
    if (joinRes.seat_index !== 1) {
      throw new Error(`Expected joined seat_index 1, got ${joinRes.seat_index}`);
    }
    console.log(`✅ User 2 successfully joined room ${joinTestRoom.game.room_code} at seat ${joinRes.seat_index}`);

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
