import { spawn, type ChildProcess } from "child_process";
import PocketBase from "../web/node_modules/pocketbase";
import { CardCombo, BotEngine, Hand, Trick } from "../web/src/domain";

const PB_PORT = 8096;
const PB_URL = `http://127.0.0.1:${PB_PORT}`;
const PB_DIR = "./pb/test_pb_stress_data";

async function run100GamesStressTest() {
  console.log("🎲 Starting 100-Game Monte Carlo Stress Test...");

  const server: ChildProcess = spawn(
    "./pb/pocketbase",
    ["serve", `--http=127.0.0.1:${PB_PORT}`, `--dir=${PB_DIR}`],
    { stdio: "pipe" }
  );

  // Wait for server
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
    throw new Error("Failed to start PocketBase on " + PB_URL);
  }
  console.log("✅ PocketBase server ready on " + PB_URL);

  try {
    const pb = new PocketBase(PB_URL);

    // Auth once
    const email = `stress_${Date.now()}@tjapza.local`;
    const password = "StressTestPassword123!";
    await pb.collection("users").create({
      email,
      password,
      passwordConfirm: password,
      display_name: "Stress Tester",
    });
    await pb.collection("users").authWithPassword(email, password);

    const TOTAL_GAMES = 100;
    let completedGames = 0;
    let totalMovesPlayed = 0;
    const rankDistribution = [0, 0, 0, 0];

    const startTime = Date.now();

    for (let g = 1; g <= TOTAL_GAMES; g++) {
      // 1. Create Room
      const roomRes = await pb.send("/api/tjapza/room/create", {
        method: "POST",
        body: { is_public: false },
      });
      const gameId = roomRes.game.id;

      // 2. Start Game (3 bots + 1 player)
      const startRes = await pb.send("/api/tjapza/room/start", {
        method: "POST",
        body: { game_id: gameId },
      });

      let game = startRes.game;
      let turns = 0;
      const maxTurns = 250;

      // Verify opening state
      if (game.counts.reduce((a: number, b: number) => a + b, 0) !== 52) {
        throw new Error(`Game ${g}: Total cards is not 52 at deal!`);
      }

      while (game.status === "playing" && turns < maxTurns) {
        turns++;
        totalMovesPlayed++;
        const currentTurn = game.turn_index;
        const isHuman = game.seats[currentTurn]?.user_id === pb.authStore.record?.id;

        if (isHuman) {
          const handRecord = await pb.collection("hands").getFirstListItem(
            `game_id = "${game.id}" && user_id = "${pb.authStore.record?.id}"`
          );
          const myCards: number[] = handRecord.cards || [];
          const isOpeningTrick = !game.last_combo && game.counts.every((c: number) => c === 13);
          const trick = game.last_combo?.cards?.length > 0
            ? new Trick({ lastCombo: CardCombo.evaluate(game.last_combo.cards) })
            : Trick.createFresh(currentTurn);

          const decision = BotEngine.decideMove({
            hand: new Hand(myCards),
            trick: trick,
            isOpeningMove: isOpeningTrick,
            counts: game.counts
          });

          if (decision.action === "play" && decision.cards.length > 0) {
            await pb.collection("moves").create({
              game_id: game.id,
              seat_index: currentTurn,
              action: "play",
              cards: decision.cards.map((c) => c.code),
            });
          } else {
            await pb.collection("moves").create({
              game_id: game.id,
              seat_index: currentTurn,
              action: "pass",
              cards: [],
            });
          }
        } else {
          // Bot tick
          await pb.collection("moves").create({
            game_id: game.id,
            seat_index: currentTurn,
            action: "tick",
            cards: [],
          });
        }

        // Re-fetch
        game = await pb.collection("games").getOne(game.id);
      }

      if (game.status !== "finished") {
        throw new Error(`Game ${g} failed to finish within ${maxTurns} turns! Status: ${game.status}`);
      }

      // Verify results
      const results = await pb.collection("results").getList(1, 10, {
        filter: `game_id = "${game.id}"`,
        sort: "rank",
      });

      if (results.items.length !== 4) {
        throw new Error(`Game ${g}: Expected 4 results, got ${results.items.length}`);
      }

      // Check human rank
      const humanResult = results.items.find((r) => !r.is_bot);
      if (humanResult) {
        rankDistribution[humanResult.rank - 1]++;
      }

      completedGames++;
      if (g % 20 === 0 || g === TOTAL_GAMES) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`✅ [${g}/${TOTAL_GAMES}] Games Completed (${elapsed}s elapsed) | Avg turns/game: ${(totalMovesPlayed / g).toFixed(1)}`);
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log("\n==================================================");
    console.log(`🎉 100/100 GAMES COMPLETED IN ${totalTime}s`);
    console.log(`Total Moves Evaluated: ${totalMovesPlayed}`);
    console.log("Human Rank Distribution:", {
      "1st Place": rankDistribution[0],
      "2nd Place": rankDistribution[1],
      "3rd Place": rankDistribution[2],
      "4th Place": rankDistribution[3],
    });
    console.log("==================================================\n");
  } finally {
    server.kill();
  }
}

run100GamesStressTest().catch((err) => {
  console.error("❌ Stress test failed:", err);
  process.exit(1);
});
