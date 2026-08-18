import PocketBase from "../web/node_modules/pocketbase";
import { spawn } from "child_process";

const PB_URL = "http://127.0.0.1:8096";

const testDbDir = `./pb/test_pb_automatch_${Date.now()}`;

async function runAutomatchTest() {
  console.log("🚀 Starting Full 4-Player Automatch (Quickplay) Test...\n");

  const server = spawn(
    "./pb/pocketbase",
    ["serve", "--http=127.0.0.1:8096", `--dir=${testDbDir}`],
    { stdio: ["ignore", "pipe", "pipe"] }
  );

  server.stdout.on("data", (d) => {
    const s = d.toString();
    if (s.includes("Server started")) {
      console.log("✅ PocketBase test server started on " + PB_URL);
    }
  });

  await new Promise((r) => setTimeout(r, 1200));

  try {
    // 1. Create 5 distinct test users
    const clients: PocketBase[] = [];
    for (let i = 1; i <= 5; i++) {
      const pb = new PocketBase(PB_URL);
      pb.autoCancellation(false);
      const email = `automatch_user_${i}_${Date.now()}@tjapza.local`;
      const pass = "password12345";
      await pb.collection("users").create({
        email,
        password: pass,
        passwordConfirm: pass,
        display_name: `Quick Player ${i}`,
      });
      await pb.collection("users").authWithPassword(email, pass);
      clients.push(pb);
    }

    console.log("✅ 5 distinct players authenticated.");

    // 2. Player 1 clicks Quick Play -> Creates open public room
    console.log("\n[Player 1] Calling /api/tjapza/quickplay...");
    const q1 = await clients[0].send("/api/tjapza/quickplay", { method: "POST" });
    console.log(`✅ Player 1 created public room: ${q1.game.room_code} (Game ID: ${q1.game.id}) at Seat ${q1.seat_index}`);
    if (q1.seat_index !== 0 || q1.game.status !== "waiting") {
      throw new Error(`Expected Seat 0 & waiting status, got Seat ${q1.seat_index} status ${q1.game.status}`);
    }

    // 3. Player 2 clicks Quick Play -> Matches into same room
    console.log("\n[Player 2] Calling /api/tjapza/quickplay...");
    const q2 = await clients[1].send("/api/tjapza/quickplay", { method: "POST" });
    console.log(`✅ Player 2 matched into room ${q2.game.room_code} at Seat ${q2.seat_index}`);
    if (q2.game.id !== q1.game.id || q2.seat_index !== 1) {
      throw new Error(`Expected Game ID ${q1.game.id} & Seat 1, got ${q2.game.id} Seat ${q2.seat_index}`);
    }

    // 4. Player 3 clicks Quick Play -> Matches into same room
    console.log("\n[Player 3] Calling /api/tjapza/quickplay...");
    const q3 = await clients[2].send("/api/tjapza/quickplay", { method: "POST" });
    console.log(`✅ Player 3 matched into room ${q3.game.room_code} at Seat ${q3.seat_index}`);
    if (q3.game.id !== q1.game.id || q3.seat_index !== 2) {
      throw new Error(`Expected Game ID ${q1.game.id} & Seat 2, got ${q3.game.id} Seat ${q3.seat_index}`);
    }

    // 5. Player 4 clicks Quick Play -> Matches as 4th player -> MUST AUTO-START!
    console.log("\n[Player 4] Calling /api/tjapza/quickplay (4th player triggers auto-start)...");
    const q4 = await clients[3].send("/api/tjapza/quickplay", { method: "POST" });
    console.log(`✅ Player 4 matched into room ${q4.game.room_code} at Seat ${q4.seat_index}`);
    if (q4.game.id !== q1.game.id || q4.seat_index !== 3) {
      throw new Error(`Expected Game ID ${q1.game.id} & Seat 3, got ${q4.game.id} Seat ${q4.seat_index}`);
    }

    // Verify game status is now 'playing'
    const fullGame = await clients[0].collection("games").getOne(q1.game.id);
    console.log(`✅ Game status after 4th player joined: "${fullGame.status}" (Initial Turn Seat: ${fullGame.turn_index})`);
    if (fullGame.status !== "playing") {
      throw new Error(`Expected game status to be 'playing', got '${fullGame.status}'`);
    }

    // Verify all 4 players have hands dealt with 13 cards each
    console.log("\n🔄 Verifying dealt hands for all 4 players...");
    for (let s = 0; s < 4; s++) {
      const handRec = await clients[s].collection("hands").getFirstListItem(`game_id = "${q1.game.id}" && seat_index = ${s}`);
      const cards = handRec.cards || [];
      console.log(`   Player ${s + 1} (Seat ${s}) received ${cards.length} cards.`);
      if (cards.length !== 13) {
        throw new Error(`Expected Seat ${s} to have 13 cards, got ${cards.length}`);
      }
    }
    console.log("✅ All 4 players successfully received full 13-card hands.");

    // 6. Player 5 clicks Quick Play -> Previous room is full, must create a NEW room
    console.log("\n[Player 5] Calling /api/tjapza/quickplay after room 1 is filled...");
    const q5 = await clients[4].send("/api/tjapza/quickplay", { method: "POST" });
    console.log(`✅ Player 5 created NEW public room: ${q5.game.room_code} (Game ID: ${q5.game.id}) at Seat ${q5.seat_index}`);
    if (q5.game.id === q1.game.id) {
      throw new Error("Player 5 should not be matched into a full game!");
    }
    if (q5.seat_index !== 0 || q5.game.status !== "waiting") {
      throw new Error(`Expected Player 5 to start Seat 0 in waiting status, got Seat ${q5.seat_index} ${q5.game.status}`);
    }

    console.log("\n=======================================================");
    console.log("🎉 ALL AUTOMATCH / QUICKPLAY TESTS PASSED PERFECTLY! 🎉");
    console.log("=======================================================\n");
  } finally {
    server.kill();
    try {
      require("fs").rmSync(testDbDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

runAutomatchTest().catch((err) => {
  console.error("❌ Automatch test failed:", err);
  process.exit(1);
});
