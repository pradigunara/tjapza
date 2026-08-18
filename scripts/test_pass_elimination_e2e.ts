import PocketBase from '../web/node_modules/pocketbase';
import { spawn } from 'child_process';
import { resolve } from 'path';

const PB_PORT = 8096;
const PB_URL = `http://127.0.0.1:${PB_PORT}`;
const PB_DIR = resolve(__dirname, '../pb');
const PB_BIN = resolve(PB_DIR, 'pocketbase');
const PB_DATA = resolve(PB_DIR, 'pb_data');

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function startServer(): Promise<any> {
  const proc = spawn(PB_BIN, ['serve', `--http=127.0.0.1:${PB_PORT}`, `--dir=${PB_DATA}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  proc.stdout.on('data', (d: Buffer) => {
    const s = d.toString();
    if (s.includes('Server started')) console.log('[PB]', s.trim());
  });

  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${PB_URL}/api/health`);
      if (res.ok) return proc;
    } catch (_) {}
    await sleep(200);
  }
  throw new Error('Could not start PocketBase server');
}

async function createPlayer(name: string, index: number): Promise<{ pb: PocketBase; user: any }> {
  const client = new PocketBase(PB_URL);
  client.autoCancellation(false);
  const email = `test_pass_p${index}_${Date.now()}@tjapza.local`;
  const password = 'Password123!';
  const user = await client.collection('users').create({
    email,
    password,
    passwordConfirm: password,
    name,
    display_name: name,
  });
  await client.collection('users').authWithPassword(email, password);
  return { pb: client, user };
}

async function runPassEliminationTests() {
  console.log('🧪 Starting Pass Elimination Rule E2E Test...');
  let serverProc = null;
  try {
    serverProc = await startServer();
  } catch {
    console.log('Using existing PB instance on', PB_URL);
  }

  try {
    // 1. Create 4 human players
    const p0 = await createPlayer('Alice', 0);
    const p1 = await createPlayer('Bob', 1);
    const p2 = await createPlayer('Charlie', 2);
    const p3 = await createPlayer('Dave', 3);
    console.log('✅ Created 4 players: Alice, Bob, Charlie, Dave');

    // 2. Alice creates a private room
    const createRes = await p0.pb.send('/api/tjapza/room/create', {
      method: 'POST',
      body: { is_public: false },
    });
    const gameId = createRes.game.id;
    const roomCode = createRes.game.room_code;
    console.log(`✅ Created Room ${roomCode} (${gameId})`);

    // 3. Bob, Charlie, Dave join the room
    await p1.pb.send('/api/tjapza/room/join', { method: 'POST', body: { room_code: roomCode } });
    await p2.pb.send('/api/tjapza/room/join', { method: 'POST', body: { room_code: roomCode } });
    await p3.pb.send('/api/tjapza/room/join', { method: 'POST', body: { room_code: roomCode } });
    console.log('✅ All 4 players joined seats [0, 1, 2, 3]');

    // 4. Start the game (deals cards)
    const startRes = await p0.pb.send('/api/tjapza/room/start', {
      method: 'POST',
      body: { game_id: gameId },
    });
    let game = startRes.game;
    console.log(`✅ Game started! Initial turn seat: ${game.turn_index}`);

    // Fetch each player's hand cards
    const getHand = async (client: PocketBase, seatIdx: number) => {
      const rec = await client.collection('hands').getFirstListItem(`game_id = "${gameId}" && seat_index = ${seatIdx}`);
      return rec.cards as number[];
    };

    const players = [p0, p1, p2, p3];
    const hands = await Promise.all(players.map((p, i) => getHand(p.pb, i)));

    // Find seat with 3♦ (card code 0)
    let currentSeat = game.turn_index;
    console.log(`Seat holding 3♦: Seat ${currentSeat}`);
    if (!hands[currentSeat].includes(0)) {
      throw new Error(`Seat ${currentSeat} does not hold 3♦!`);
    }

    // Step 1: Opening Play - Current player leads 3♦
    console.log(`\n--- Step 1: Seat ${currentSeat} leads 3♦ ---`);
    await players[currentSeat].pb.collection('moves').create({
      game_id: gameId,
      seat_index: currentSeat,
      action: 'play',
      cards: [0],
    });

    game = await p0.pb.collection('games').getOne(gameId);
    let sNext1 = (currentSeat + 1) % 4;
    console.log(`Turn advanced to: Seat ${game.turn_index} (expected Seat ${sNext1})`);
    if (game.turn_index !== sNext1) throw new Error(`Expected turn ${sNext1}, got ${game.turn_index}`);

    // Step 2: Next player (sNext1) PASSES!
    console.log(`\n--- Step 2: Seat ${sNext1} PASSES ---`);
    await players[sNext1].pb.collection('moves').create({
      game_id: gameId,
      seat_index: sNext1,
      action: 'pass',
      cards: [],
    });

    game = await p0.pb.collection('games').getOne(gameId);
    let sNext2 = (currentSeat + 2) % 4;
    console.log(`Passed seats: ${JSON.stringify(game.passed_seats)} (expected [${sNext1}])`);
    console.log(`Turn advanced to: Seat ${game.turn_index} (expected Seat ${sNext2})`);
    if (!game.passed_seats?.includes(sNext1)) throw new Error(`Seat ${sNext1} not in passed_seats!`);
    if (game.turn_index !== sNext2) throw new Error(`Expected turn ${sNext2}, got ${game.turn_index}`);

    // Step 3: Next player (sNext2) plays a higher single
    // Find a card in sNext2's hand > 3♦ (rank >= 0, card > 0)
    const validCard2 = hands[sNext2].find((c) => c > 0 && c < 50);
    if (validCard2 === undefined) throw new Error('No valid card found for sNext2');
    console.log(`\n--- Step 3: Seat ${sNext2} plays higher single: card ${validCard2} ---`);
    await players[sNext2].pb.collection('moves').create({
      game_id: gameId,
      seat_index: sNext2,
      action: 'play',
      cards: [validCard2],
    });

    game = await p0.pb.collection('games').getOne(gameId);
    let sNext3 = (currentSeat + 3) % 4;
    console.log(`Passed seats after play: ${JSON.stringify(game.passed_seats)} (expected [${sNext1}] retained)`);
    console.log(`Turn advanced to: Seat ${game.turn_index} (expected Seat ${sNext3})`);
    if (!game.passed_seats?.includes(sNext1)) throw new Error(`Seat ${sNext1} should remain in passed_seats!`);
    if (game.turn_index !== sNext3) throw new Error(`Expected turn ${sNext3}, got ${game.turn_index}`);

    // Step 4: Next player (sNext3) plays an even higher single
    const validCard3 = hands[sNext3].find((c) => c > validCard2);
    if (validCard3 !== undefined) {
      console.log(`\n--- Step 4: Seat ${sNext3} plays higher single: card ${validCard3} ---`);
      await players[sNext3].pb.collection('moves').create({
        game_id: gameId,
        seat_index: sNext3,
        action: 'play',
        cards: [validCard3],
      });
    } else {
      console.log(`\n--- Step 4: Seat ${sNext3} PASSES ---`);
      await players[sNext3].pb.collection('moves').create({
        game_id: gameId,
        seat_index: sNext3,
        action: 'pass',
        cards: [],
      });
    }

    game = await p0.pb.collection('games').getOne(gameId);
    console.log(`Turn advanced to: Seat ${game.turn_index}`);

    // CRITICAL ASSERTION: The turn must have SKIPPED Seat sNext1 (who passed earlier in this trick)!
    console.log(`\n🌟 CRITICAL CHECK: Verifying Seat ${sNext1} was SKIPPED because they passed in this trick...`);
    if (game.turn_index === sNext1) {
      throw new Error(`FAIL: Seat ${sNext1} was given a turn even though they already passed in this trick!`);
    }
    console.log(`✅ SUCCESS: Seat ${sNext1} was correctly skipped! Turn is at Seat ${game.turn_index}`);

    // Step 5: Test that Seat sNext1 CANNOT submit a move
    console.log(`\n--- Step 5: Asserting Seat ${sNext1} gets rejected if they try to move ---`);
    let rejected = false;
    try {
      await players[sNext1].pb.collection('moves').create({
        game_id: gameId,
        seat_index: sNext1,
        action: 'pass',
        cards: [],
      });
    } catch (err: any) {
      rejected = true;
      console.log(`✅ Server correctly rejected out-of-turn / passed player move: ${err.message}`);
    }
    if (!rejected) {
      throw new Error(`FAIL: Server accepted move from Seat ${sNext1} who already passed!`);
    }

    // Step 6: Remaining players pass until the trick ends
    console.log(`\n--- Step 6: Remaining active players pass to conclude the trick ---`);
    while (game.last_combo !== null) {
      const activeTurn = game.turn_index;
      console.log(`Seat ${activeTurn} passes...`);
      await players[activeTurn].pb.collection('moves').create({
        game_id: gameId,
        seat_index: activeTurn,
        action: 'pass',
        cards: [],
      });
      game = await p0.pb.collection('games').getOne(gameId);
    }

    console.log(`\n✅ Trick ended! New Trick Leader: Seat ${game.turn_index}`);
    console.log(`✅ Passed seats reset to: ${JSON.stringify(game.passed_seats)} (expected [])`);
    console.log(`✅ Last combo cleared: ${game.last_combo} (expected null)`);

    if (game.passed_seats && game.passed_seats.length > 0) {
      throw new Error('passed_seats should be empty on a new trick!');
    }
    if (game.last_combo !== null) {
      throw new Error('last_combo should be null on a new trick!');
    }

    // Step 7: On the new trick, verify all players can participate again
    const leaderSeat = game.turn_index;
    const freshHand = await getHand(players[leaderSeat].pb, leaderSeat);
    console.log(`\n--- Step 7: Trick Leader Seat ${leaderSeat} leads a new card ${freshHand[0]} ---`);
    await players[leaderSeat].pb.collection('moves').create({
      game_id: gameId,
      seat_index: leaderSeat,
      action: 'play',
      cards: [freshHand[0]],
    });

    game = await p0.pb.collection('games').getOne(gameId);
    const newNextSeat = game.turn_index;
    console.log(`Turn advanced on new trick to: Seat ${newNextSeat}`);
    console.log(`Passed seats on new trick: ${JSON.stringify(game.passed_seats)}`);

    console.log('\n=================================================');
    console.log('🌟 PASS ELIMINATION E2E INTEGRATION TESTS PASSED! 🌟');
    console.log('=================================================\n');
  } finally {
    if (serverProc) {
      serverProc.kill();
    }
  }
}

runPassEliminationTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
