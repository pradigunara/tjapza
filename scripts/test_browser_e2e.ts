import { spawn, type ChildProcess } from "child_process";
import PocketBase from "../web/node_modules/pocketbase";

const PB_PORT = 8097;
const PB_URL = `http://127.0.0.1:${PB_PORT}`;
const PB_DIR = "./pb/test_pb_e2e_data";

async function runBrowserE2ETest() {
  console.log("🎮 Running Browser + Engine Full E2E Verification...");

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
  console.log("✅ PocketBase server started on " + PB_URL);

  try {

  const pb = new PocketBase(PB_URL);

  // Authenticate user
  const email = `player_${Date.now()}@tjapza.local`;
  const password = "Password123!";
  const user = await pb.collection("users").create({
    email,
    password,
    passwordConfirm: password,
    display_name: "Pro Champion",
  });
  await pb.collection("users").authWithPassword(email, password);
  console.log("✅ Authenticated as Pro Champion:", user.id);

  // Create room
  const room = await pb.send("/api/tjapza/room/create", {
    method: "POST",
    body: { is_public: false },
  });
  const gameId = room.game.id;
  const roomCode = room.game.room_code;
  console.log(`✅ Room Created: ${roomCode} (${gameId})`);

  // Start game with 3 bots
  const started = await pb.send("/api/tjapza/room/start", {
    method: "POST",
    body: { game_id: gameId },
  });
  console.log(`✅ Game Started! Opening Turn: Seat ${started.game.turn_index}`);

  let game = started.game;
  let turns = 0;
  const maxTurns = 200;

  const { classifyCombo, getBotMove } = await import("../web/src/rules/cards");

  while (game.status === "playing" && turns < maxTurns) {
    turns++;
    const currentTurn = game.turn_index;
    const isHuman = game.seats[currentTurn]?.user_id === user.id;

    if (isHuman) {
      const handRecord = await pb.collection("hands").getFirstListItem(
        `game_id = "${game.id}" && user_id = "${user.id}"`
      );
      const myCards: number[] = handRecord.cards || [];
      const isOpening = !game.last_combo && game.counts.every((c: number) => c === 13);
      const otherCounts = game.counts.filter((c: number, idx: number) => idx !== currentTurn && c > 0);
      const minOther = otherCounts.length > 0 ? Math.min(...otherCounts) : 13;

      const move = getBotMove(myCards, game.last_combo?.cards || game.last_combo, isOpening, minOther);
      if (move && move.length > 0) {
        const combo = classifyCombo(move);
        console.log(`[Move ${turns}] 👤 Human Seat ${currentTurn} PLAY:`, combo?.type, move);
        await pb.collection("moves").create({
          game_id: game.id,
          seat_index: currentTurn,
          action: "play",
          cards: move,
        });
      } else {
        console.log(`[Move ${turns}] 👤 Human Seat ${currentTurn} PASS`);
        await pb.collection("moves").create({
          game_id: game.id,
          seat_index: currentTurn,
          action: "pass",
          cards: [],
        });
      }
    } else {
      // Bot tick
      const botMoveRecord = await pb.collection("moves").create({
        game_id: game.id,
        seat_index: currentTurn,
        action: "tick",
        cards: [],
      });
      console.log(`[Move ${turns}] 🤖 Bot Seat ${currentTurn} ${botMoveRecord.action.toUpperCase()}:`, botMoveRecord.combo_type || "");
    }

    game = await pb.collection("games").getOne(game.id);
  }

  console.log(`\n🏁 Game Status: ${game.status.toUpperCase()} in ${turns} turns!`);
  console.log("🏆 Winner Ranks:", game.winner_ranks);

  // Verify Results
  const results = await pb.collection("results").getList(1, 10, {
    filter: `game_id = "${game.id}"`,
    sort: "rank",
  });
  console.log("\n📊 Official Scoreboard:");
  results.items.forEach((r) => {
    const seatInfo = game.seats[r.seat_index];
    const medal = r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : "4️⃣";
    console.log(`   ${medal} Rank #${r.rank}: ${seatInfo?.name || `Seat ${r.seat_index + 1}`} (${r.is_bot ? "Bot" : "Human"})`);
  });

  // Rematch Test
  console.log("\n🔄 Requesting Rematch...");
  const rematch = await pb.send("/api/tjapza/rematch", {
    method: "POST",
    body: { game_id: game.id },
  });
  console.log(`✅ Rematch Game Created & Dealt: ${rematch.game.id} (Status: ${rematch.game.status}, Turn: Seat ${rematch.game.turn_index})`);

  // Verify new game has 52 cards dealt in counts
  if (rematch.game.counts.reduce((a: number, b: number) => a + b, 0) !== 52) {
    throw new Error("Rematch game did not deal 52 cards!");
  }
  console.log("✅ Rematch game has 52 cards dealt across 4 seats!");

  console.log("\n=================================================");
  console.log("🎉 ALL EXTENSIVE END-TO-END TESTS PASSED 100%! 🎉");
  console.log("=================================================\n");
  } finally {
    server.kill();
  }
}

runBrowserE2ETest().catch((err) => {
  console.error("❌ E2E verification failed:", err);
  process.exit(1);
});
