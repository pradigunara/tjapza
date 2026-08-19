/**
 * Regression e2e for the lobby hardening batch:
 *  1. Public rooms: any seated human may force-start (non-host included).
 *  2. Private rooms: non-host start is still rejected (403).
 *  3. Concurrent joins claim distinct seats (no lost writes).
 *  4. Concurrent starts deal exactly once (4 hands, counts 13x4).
 *  5. Concurrent quickplay users never duplicate a seat in a room.
 */
import { spawn, type ChildProcess } from "child_process";
import { rmSync } from "fs";
import PocketBase from "../web/node_modules/pocketbase";

const PORT = 8094;
const URL = `http://127.0.0.1:${PORT}`;
const DIR = "./pb/test_pb_lobby_data";

function fail(msg: string): never {
  // Throw (never process.exit) so the finally block kills the server and
  // removes the data dir — an orphaned server would poison later runs.
  throw new Error(msg);
}

async function newUser(name: string): Promise<PocketBase> {
  const pb = new PocketBase(URL);
  pb.autoCancellation(false); // concurrent same-route requests are intentional here
  const email = `${name.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@tjapza.local`;
  const password = "Password123!";
  await pb.collection("users").create({ email, password, passwordConfirm: password, display_name: name });
  await pb.collection("users").authWithPassword(email, password);
  return pb;
}

async function main() {
  rmSync(DIR, { recursive: true, force: true });

  const SU_EMAIL = "lobby@test.local";
  const SU_PASS = "SuperSecret123!";
  const su = Bun.spawnSync(["./pb/pocketbase", "superuser", "upsert", SU_EMAIL, SU_PASS, `--dir=${DIR}`]);
  if (su.exitCode !== 0) fail(`superuser upsert failed: ${su.stderr.toString()}`);

  const server: ChildProcess = spawn("./pb/pocketbase", [
    "serve", `--http=127.0.0.1:${PORT}`, `--dir=${DIR}`,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  server.stderr?.on("data", (d) => { const s = d.toString(); if (s.includes("ERROR")) console.error("[pb]", s.trim()); });

  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${URL}/api/health`)).ok) break; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
  }

  const pbSu = new PocketBase(URL);
  pbSu.autoCancellation(false);
  await pbSu.collection("_superusers").authWithPassword(SU_EMAIL, SU_PASS);


  try {
    // ---------------------------------------------------------------- Test 1
    console.log("--- TEST 1: Public force-start by non-host ---");
    const host = await newUser("PubHost");
    const guest = await newUser("PubGuest");
    const pub = await host.send("/api/tjapza/room/create", { method: "POST", body: { is_public: true } });
    await guest.send("/api/tjapza/room/join", { method: "POST", body: { game_id: pub.game.id } });
    const started = await guest.send("/api/tjapza/room/start", { method: "POST", body: { game_id: pub.game.id } });
    if (started.game.status !== "playing") fail("non-host could not start public room");
    const botCount = started.game.seats.filter((s: any) => s?.is_bot).length;
    if (botCount !== 2) fail(`expected 2 bots filled, got ${botCount}`);
    console.log("✅ Non-host started public room; bots filled remaining seats");

    // ---------------------------------------------------------------- Test 2
    console.log("--- TEST 2: Private start remains host-only ---");
    const pHost = await newUser("PrivHost");
    const pGuest = await newUser("PrivGuest");
    const priv = await pHost.send("/api/tjapza/room/create", { method: "POST", body: { is_public: false } });
    await pGuest.send("/api/tjapza/room/join", { method: "POST", body: { game_id: priv.game.id } });
    let rejected = false;
    try {
      await pGuest.send("/api/tjapza/room/start", { method: "POST", body: { game_id: priv.game.id } });
    } catch {
      rejected = true;
    }
    if (!rejected) fail("non-host was able to start a PRIVATE room!");
    await pHost.send("/api/tjapza/room/start", { method: "POST", body: { game_id: priv.game.id } });
    console.log("✅ Private room: non-host rejected, host start succeeded");

    // ---------------------------------------------------------------- Test 3
    console.log("--- TEST 3: Concurrent joins claim distinct seats ---");
    const jHost = await newUser("JoinHost");
    const jRoom = await jHost.send("/api/tjapza/room/create", { method: "POST", body: { is_public: false } });
    const joiners = await Promise.all([
      newUser("JoinA"), newUser("JoinB"), newUser("JoinC"),
    ]);
    const claims = await Promise.allSettled(joiners.map((u) =>
      u.send("/api/tjapza/room/join", { method: "POST", body: { game_id: jRoom.game.id } })
    ));
    const seats = claims.map((r) => (r.status === "fulfilled" ? (r.value as any).seat_index : -1));
    if (seats.some((s) => s === -1)) fail(`a concurrent join failed: ${JSON.stringify(seats)}`);
    if (new Set(seats).size !== 3) fail(`seat collision under concurrency: ${JSON.stringify(seats)}`);
    const finalGame: any = await jHost.collection("games").getOne(jRoom.game.id);
    const userIds = finalGame.seats.map((s: any) => s?.user_id).filter(Boolean);
    if (new Set(userIds).size !== 4) fail(`seat overwrite lost a player: ${JSON.stringify(userIds)}`);
    console.log(`✅ 3 concurrent joins → distinct seats ${JSON.stringify(seats)}, all 4 players persisted`);

    // ---------------------------------------------------------------- Test 4
    const sHost = await newUser("StartHost");
    const sRoom = await sHost.send("/api/tjapza/room/create", { method: "POST", body: { is_public: false } });
    const starts = await Promise.all([
      sHost.send("/api/tjapza/room/start", { method: "POST", body: { game_id: sRoom.game.id } }),
      sHost.send("/api/tjapza/room/start", { method: "POST", body: { game_id: sRoom.game.id } }),
      sHost.send("/api/tjapza/room/start", { method: "POST", body: { game_id: sRoom.game.id } }),
    ]);
    if (!starts.every((s: any) => s.game.status === "playing")) fail("a concurrent start did not resolve to playing");
    const dealtGame: any = await sHost.collection("games").getOne(sRoom.game.id);
    // Superuser view: the host's own list is rule-limited to their hand only
    const hands = await pbSu.collection("hands").getFullList({ filter: `game_id = "${sRoom.game.id}"` });
    if (hands.length !== 4) fail(`double-deal detected: ${hands.length} hands (expected 4)`);
    if (JSON.stringify(dealtGame.counts) !== JSON.stringify([13, 13, 13, 13])) fail(`counts corrupted: ${JSON.stringify(dealtGame.counts)}`);
    const totalCards = hands.reduce((n, h) => n + (h.cards?.length || 0), 0);
    if (totalCards !== 52) fail(`deck integrity broken: ${totalCards} cards across hands`);
    console.log("✅ 3 concurrent starts → single deal, 4 hands, 52 cards intact");

    // ---------------------------------------------------------------- Test 5
    console.log("--- TEST 5: Concurrent quickplay never duplicates seats ---");
    const qpUsers = await Promise.all([newUser("QpA"), newUser("QpB"), newUser("QpC"), newUser("QpD")]);
    const qpRes = await Promise.all(qpUsers.map((u) => u.send("/api/tjapza/quickplay", { method: "POST" })));
    const byGame = new Map<string, { seat: number; userId: string }[]>();
    qpUsers.forEach((u, i) => {
      const g = (qpRes[i] as any).game;
      if (!byGame.has(g.id)) byGame.set(g.id, []);
      byGame.get(g.id)!.push({ seat: (qpRes[i] as any).seat_index, userId: u.authStore.record!.id });
    });
    for (const [gid, entries] of byGame) {
      const seatSet = new Set(entries.map((e) => e.seat));
      if (seatSet.size !== entries.length) {
        fail(`quickplay seat collision in game ${gid}: ${JSON.stringify(entries)}`);
      }
      const verify: any = await qpUsers[0].collection("games").getOne(gid);
      const ids = verify.seats.map((s: any) => s?.user_id).filter(Boolean);
      if (new Set(ids).size !== ids.length) {
        fail(`quickplay persisted duplicate seat in game ${gid}: ${JSON.stringify(verify.seats)}`);
      }
    }
    const fourHumanGame = [...byGame.values()].find((e) => e.length === 4);
    if (fourHumanGame) {
      const gid = [...byGame.entries()].find(([, e]) => e.length === 4)![0];
      const g: any = await qpUsers[0].collection("games").getOne(gid);
      if (g.status !== "playing") fail("4-human quickplay room did not auto-deal");
      console.log("✅ 4 concurrent quickplay users → one room, distinct seats, auto-dealt");
    } else {
      console.log("✅ Concurrent quickplay users → no seat duplication across rooms");
    }

    console.log("\n🎉 LOBBY HARDENING REGRESSION PASSED");
  } finally {
    server.kill();
    await new Promise((r) => setTimeout(r, 300));
    rmSync(DIR, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("❌ Lobby hardening test failed:", err?.message || err);
  // Defensive: if failure happened before/outside the finally, still clean up
  rmSync(DIR, { recursive: true, force: true });
  process.exit(1);
});
