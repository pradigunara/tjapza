import { spawn, type ChildProcess } from "child_process";
import PocketBase from "../web/node_modules/pocketbase";
import { decideBotMoveFromGame } from "./lib/botFromGame";

const PB_PORT = 8097;
const PB_URL = `http://127.0.0.1:${PB_PORT}`;
const PB_DIR = "./pb/test_pb_hand_stress_data";

interface MatchConfig {
  name: string;
  numHumans: number; // 1, 2, 3, or 4 humans
  isRematch?: boolean;
  isQuickplay?: boolean;
}

async function runHandRecordsStressTest() {
  console.log("================================================================================");
  console.log("🃏 STARTING COMPREHENSIVE HAND RECORDS & SEAT CONFIGURATION STRESS TEST SUITE");
  console.log("================================================================================\n");

  // Clean data dir
  try {
    const fs = await import("fs");
    if (fs.existsSync(PB_DIR)) {
      fs.rmSync(PB_DIR, { recursive: true, force: true });
    }
  } catch (_) {}

  // Spawn PocketBase
  const server: ChildProcess = spawn(
    "./pb/pocketbase",
    ["serve", `--http=127.0.0.1:${PB_PORT}`, `--dir=${PB_DIR}`],
    { stdio: "pipe" }
  );

  server.stdout?.on("data", (d) => {
    const str = d.toString();
    if (str.includes("HAND_NOT_FOUND") || str.includes("ERROR") || str.includes("error")) {
      console.log("[PB OUT]", str.trim());
    }
  });

  server.stderr?.on("data", (d) => {
    console.error("[PB ERR]", d.toString().trim());
  });

  // Wait for server ready
  let ready = false;
  for (let i = 0; i < 40; i++) {
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
    throw new Error(`Failed to start PocketBase on ${PB_URL}`);
  }
  console.log(`✅ PocketBase test server ready on ${PB_URL}\n`);

  let totalGamesPlayed = 0;
  let totalMovesPlayed = 0;
  let totalHandNotFoundErrors = 0;
  let totalOtherErrors = 0;

  try {
    // 1. Create 4 Authenticated Test Users
    const clients: PocketBase[] = [];
    const users: any[] = [];

    for (let u = 0; u < 4; u++) {
      const pb = new PocketBase(PB_URL);
      pb.autoCancellation(false);
      const email = `player_seat_${u}_${Date.now()}@tjapza.local`;
      const pass = "StressTestPass123!";
      const user = await pb.collection("users").create({
        email,
        password: pass,
        passwordConfirm: pass,
        display_name: `Human Player ${u + 1}`,
      });
      await pb.collection("users").authWithPassword(email, pass);
      clients.push(pb);
      users.push(user);
    }
    console.log("✅ Created 4 distinct authenticated player accounts\n");

    // 2. Define 25 Match Configurations covering all seat scenarios
    const matchConfigs: MatchConfig[] = [
      // 1 Human (Seat 0) + 3 Bots (Seats 1, 2, 3) - 5 matches
      { name: "Match 1 [1 Human (Seat 0) + 3 Bots]", numHumans: 1 },
      { name: "Match 2 [1 Human (Seat 0) + 3 Bots]", numHumans: 1 },
      { name: "Match 3 [1 Human (Seat 0) + 3 Bots]", numHumans: 1 },
      { name: "Match 4 [1 Human (Seat 0) + 3 Bots]", numHumans: 1 },
      { name: "Match 5 [1 Human (Seat 0) + 3 Bots]", numHumans: 1 },

      // 2 Humans (Seats 0, 1) + 2 Bots (Seats 2, 3) - 5 matches
      { name: "Match 6 [2 Humans (Seats 0, 1) + 2 Bots]", numHumans: 2 },
      { name: "Match 7 [2 Humans (Seats 0, 1) + 2 Bots]", numHumans: 2 },
      { name: "Match 8 [2 Humans (Seats 0, 1) + 2 Bots]", numHumans: 2 },
      { name: "Match 9 [2 Humans (Seats 0, 1) + 2 Bots]", numHumans: 2 },
      { name: "Match 10 [2 Humans (Seats 0, 1) + 2 Bots]", numHumans: 2 },

      // 3 Humans (Seats 0, 1, 2) + 1 Bot (Seat 3) - 4 matches
      { name: "Match 11 [3 Humans (Seats 0, 1, 2) + 1 Bot]", numHumans: 3 },
      { name: "Match 12 [3 Humans (Seats 0, 1, 2) + 1 Bot]", numHumans: 3 },
      { name: "Match 13 [3 Humans (Seats 0, 1, 2) + 1 Bot]", numHumans: 3 },
      { name: "Match 14 [3 Humans (Seats 0, 1, 2) + 1 Bot]", numHumans: 3 },

      // 4 Humans (Seats 0, 1, 2, 3) - 4 matches
      { name: "Match 15 [4 Humans (All Seats 0..3)]", numHumans: 4 },
      { name: "Match 16 [4 Humans (All Seats 0..3)]", numHumans: 4 },
      { name: "Match 17 [4 Humans (All Seats 0..3)]", numHumans: 4 },
      { name: "Match 18 [4 Humans (All Seats 0..3)]", numHumans: 4 },

      // Quickplay Match (Auto-match 2 humans + fill bots) - 2 matches
      { name: "Match 19 [Quickplay Match 1]", numHumans: 2, isQuickplay: true },
      { name: "Match 20 [Quickplay Match 2]", numHumans: 2, isQuickplay: true },

      // Rematch Chain (1 initial + 3 consecutive rematches) - 4 matches
      { name: "Match 21 [Rematch Root (2 Humans + 2 Bots)]", numHumans: 2 },
      { name: "Match 22 [Rematch Chain Round 1]", numHumans: 2, isRematch: true },
      { name: "Match 23 [Rematch Chain Round 2]", numHumans: 2, isRematch: true },
      { name: "Match 24 [Rematch Chain Round 3]", numHumans: 2, isRematch: true },

      // Reconnect / Page Reload mid-game - 1 match
      { name: "Match 25 [Mid-game Reconnection & Refresh]", numHumans: 2 },
    ];

    let lastFinishedGameId = "";

    for (let m = 0; m < matchConfigs.length; m++) {
      const config = matchConfigs[m];
      const matchNum = m + 1;
      console.log(`--- ${config.name} (${matchNum}/${matchConfigs.length}) ---`);

      let game: any = null;
      const primaryClient = clients[0];

      if (config.isRematch && lastFinishedGameId) {
        // Trigger rematch from finished game
        const rematchRes = await primaryClient.send("/api/tjapza/rematch", {
          method: "POST",
          body: { game_id: lastFinishedGameId },
        });
        game = rematchRes.game;
        console.log(`  🔄 Rematch started from Game ${lastFinishedGameId} -> New Game ${game.id}`);
      } else if (config.isQuickplay) {
        // Player 0 creates/finds quickplay
        const qp1 = await clients[0].send("/api/tjapza/quickplay", { method: "POST" });
        // Player 1 joins quickplay
        await clients[1].send("/api/tjapza/quickplay", { method: "POST" });
        // Host starts game with bots
        const startRes = await clients[0].send("/api/tjapza/room/start", {
          method: "POST",
          body: { game_id: qp1.game.id },
        });
        game = startRes.game;
        console.log(`  ⚡ Quickplay started for Game ${game.id}`);
      } else {
        // Create new room
        const createRes = await primaryClient.send("/api/tjapza/room/create", {
          method: "POST",
          body: { is_public: false },
        });
        let curGame = createRes.game;

        // Join additional human players
        for (let h = 1; h < config.numHumans; h++) {
          const joiningClient = clients[h];
          const joinRes = await joiningClient.send("/api/tjapza/room/join", {
            method: "POST",
            body: { room_code: curGame.room_code },
          });
          curGame = joinRes.game;
        }

        // Start game (fills remaining empty seats with bots)
        const startRes = await primaryClient.send("/api/tjapza/room/start", {
          method: "POST",
          body: { game_id: curGame.id },
        });
        game = startRes.game;
      }

      totalGamesPlayed++;
      let movesInGame = 0;
      const maxMoves = 300;

      // Verify hands are created for all 4 seats
      for (let s = 0; s < 4; s++) {
        const isHumanSeat = s < config.numHumans;
        if (isHumanSeat) {
          const client = clients[s];
          try {
            const h = await client.collection("hands").getFirstListItem(`game_id = "${game.id}" && seat_index = ${s}`);
            if (!h || !Array.isArray(h.cards) || h.cards.length !== 13) {
              throw new Error(`Invalid initial hand for seat ${s}: expected 13 cards`);
            }
          } catch (e: any) {
            console.error(`  ❌ Failed to fetch initial hand for seat ${s}:`, e.message);
            totalHandNotFoundErrors++;
          }
        }
      }

      // Game Loop
      while (game.status === "playing" && movesInGame < maxMoves) {
        movesInGame++;
        totalMovesPlayed++;
        const currentTurn = game.turn_index;
        const isHumanTurn = currentTurn < config.numHumans;

        if (isHumanTurn) {
          const humanClient = clients[currentTurn];

          // Fetch Hand
          let myCards: number[] = [];
          try {
            const handRecord = await humanClient.collection("hands").getFirstListItem(
              `game_id = "${game.id}" && seat_index = ${currentTurn}`
            );
            myCards = handRecord.cards || [];
          } catch (err: any) {
            console.error(`  ❌ [HAND NOT FOUND ERROR] in Game ${game.id} for human seat ${currentTurn}:`, err.message);
            totalHandNotFoundErrors++;
            throw err;
          }

          const decision = decideBotMoveFromGame(game, myCards, currentTurn);

          try {
            if (decision.action === "play") {
              const playedCodes = decision.cards.map((c) => c.code);
              await humanClient.collection("moves").create({
                game_id: game.id,
                seat_index: currentTurn,
                action: "play",
                cards: playedCodes,
              });
            } else {
              await humanClient.collection("moves").create({
                game_id: game.id,
                seat_index: currentTurn,
                action: "pass",
                cards: [],
              });
            }
          } catch (moveErr: any) {
            if (moveErr.message?.includes("Hand record not found")) {
              console.error(`  ❌ 'Hand record not found' returned on play/pass for seat ${currentTurn}!`);
              totalHandNotFoundErrors++;
            } else {
              console.error(`  ❌ Move error for seat ${currentTurn}:`, moveErr.message);
              totalOtherErrors++;
            }
            throw moveErr;
          }
        } else {
          // Bot Turn: Send Tick
          try {
            await primaryClient.collection("moves").create({
              game_id: game.id,
              seat_index: currentTurn,
              action: "tick",
              cards: [],
            });
          } catch (tickErr: any) {
            if (tickErr.message?.includes("Hand record not found") || tickErr.message?.includes("Hand not found")) {
              console.error(`  ❌ 'Hand not found' error on bot tick for seat ${currentTurn}!`, tickErr.message);
              totalHandNotFoundErrors++;
            } else {
              console.error(`  ❌ Bot tick error for seat ${currentTurn}:`, tickErr.message);
              totalOtherErrors++;
            }
            throw tickErr;
          }
        }

        // Fetch fresh game state
        game = await primaryClient.collection("games").getOne(game.id);

        // Test mid-game reconnection on Match 25
        if (config.name.includes("Reconnection") && movesInGame === 12) {
          const rejoinClient = clients[0];
          const rejoinRes = await rejoinClient.send("/api/tjapza/room/join", {
            method: "POST",
            body: { game_id: game.id },
          });
          if (rejoinRes.seat_index !== 0) {
            throw new Error(`Reconnection seat mismatch: expected 0, got ${rejoinRes.seat_index}`);
          }
          console.log(`  🔌 Mid-game reconnect verified successfully for seat ${rejoinRes.seat_index}!`);
        }
      }

      if (game.status !== "finished") {
        throw new Error(`Match ${matchNum} did not complete within ${maxMoves} moves! Final status: ${game.status}`);
      }

      lastFinishedGameId = game.id;
      console.log(`  ✅ Match ${matchNum} completed in ${movesInGame} moves. Winner Ranks: [${game.winner_ranks.join(", ")}]`);
    }

    console.log("\n================================================================================");
    console.log("📊 STRESS TEST SUITE EXECUTION SUMMARY");
    console.log("================================================================================");
    console.log(`Total Matches Played:             ${totalGamesPlayed} / ${matchConfigs.length}`);
    console.log(`Total Moves/Ticks Executed:       ${totalMovesPlayed}`);
    console.log(`'Hand record not found' Errors:   ${totalHandNotFoundErrors}`);
    console.log(`Other Unexpected Errors:          ${totalOtherErrors}`);
    console.log("================================================================================");

    if (totalHandNotFoundErrors > 0 || totalOtherErrors > 0) {
      throw new Error(`Stress test failed with ${totalHandNotFoundErrors} Hand record not found errors and ${totalOtherErrors} other errors.`);
    }

    console.log("\n🎉 ALL 25 MATCHES PASSED WITH ZERO HAND RECORD ERRORS! 🎉\n");
  } finally {
    server.kill();
  }
}

runHandRecordsStressTest().catch((err) => {
  console.error("💥 Stress test execution failed:", err);
  process.exit(1);
});
