import PocketBase from '../web/node_modules/pocketbase';
import { CardCombo } from '../web/src/domain';
import { decideBotMoveFromGame } from './lib/botFromGame';

async function runMultiplayerTest() {
  console.log('🎮 Starting 4-Human Simultaneous Multiplayer Test...');
  const pb1 = new PocketBase('http://127.0.0.1:8090');
  const pb2 = new PocketBase('http://127.0.0.1:8090');
  const pb3 = new PocketBase('http://127.0.0.1:8090');
  const pb4 = new PocketBase('http://127.0.0.1:8090');

  // Authenticate 4 distinct human players
  async function getOrCreateUser(pb: PocketBase, email: string, name: string) {
    try {
      return await pb.collection('users').authWithPassword(email, 'TestPassword123!');
    } catch {
      await pb.collection('users').create({
        email,
        password: 'TestPassword123!',
        passwordConfirm: 'TestPassword123!',
        name,
      });
      return await pb.collection('users').authWithPassword(email, 'TestPassword123!');
    }
  }

  await getOrCreateUser(pb1, 'alice_mp@tjapza.local', 'Alice');
  await getOrCreateUser(pb2, 'bob_mp@tjapza.local', 'Bob');
  await getOrCreateUser(pb3, 'charlie_mp@tjapza.local', 'Charlie');
  await getOrCreateUser(pb4, 'david_mp@tjapza.local', 'David');

  console.log('✅ Authenticated 4 distinct human users (Alice, Bob, Charlie, David)');

  // 1. Alice creates room
  const createRes = (await pb1.send('/api/tjapza/room/create', {
    method: 'POST',
    body: { is_public: false },
  })) as any;
  const roomCode = createRes.game.room_code;
  const gameId = createRes.game.id;
  console.log(`✅ Room Created: ${roomCode} (ID: ${gameId}) by Alice`);

  // 2. Bob, Charlie, David join the room
  const join2 = (await pb2.send('/api/tjapza/room/join', {
    method: 'POST',
    body: { room_code: roomCode },
  })) as any;
  console.log(`✅ Bob joined at Seat ${join2.seat_index}`);

  const join3 = (await pb3.send('/api/tjapza/room/join', {
    method: 'POST',
    body: { room_code: roomCode },
  })) as any;
  console.log(`✅ Charlie joined at Seat ${join3.seat_index}`);

  const join4 = (await pb4.send('/api/tjapza/room/join', {
    method: 'POST',
    body: { room_code: roomCode },
  })) as any;
  console.log(`✅ David joined at Seat ${join4.seat_index}`);

  // 3. Alice starts the game
  const startRes = (await pb1.send('/api/tjapza/room/start', {
    method: 'POST',
    body: { game_id: gameId },
  })) as any;

  console.log(`🎲 Game Started! All 4 seats occupied by humans. Initial Turn: Seat ${startRes.game.turn_index}`);

  const pbs = [pb1, pb2, pb3, pb4];
  const names = ['Alice', 'Bob', 'Charlie', 'David'];
  let game = startRes.game;
  let moveCount = 0;

  // 4. Play game through to finish
  while (game.status === 'playing' && moveCount < 120) {
    moveCount++;
    const turn = game.turn_index;
    const currentPb = pbs[turn];
    const currentName = names[turn];

    // Fetch authorized hand for current turn player
    const handRec = await currentPb
      .collection('hands')
      .getFirstListItem(`game_id="${gameId}" && seat_index=${turn}`);
    const handCards: number[] = handRec.cards;
    const decision = decideBotMoveFromGame(game, handCards, turn);

    if (decision.action === 'play' && decision.cards.length > 0) {
      const cards = decision.cards.map((c) => c.code);
      await currentPb.collection('moves').create({
        game_id: gameId,
        seat_index: turn,
        action: 'play',
        cards: cards,
      });
      const cType = CardCombo.evaluate(cards)?.type || 'cards';
      console.log(`[Move ${moveCount}] 👤 ${currentName} (Seat ${turn}) PLAY: [ ${cards.join(', ')} ] (${cType})`);
    } else {
      await currentPb.collection('moves').create({
        game_id: gameId,
        seat_index: turn,
        action: 'pass',
        cards: [],
      });
      console.log(`[Move ${moveCount}] 👤 ${currentName} (Seat ${turn}) PASS`);
    }

    game = await pb1.collection('games').getOne(gameId);
  }

  console.log(`\n🎉 4-Human Multiplayer Match Completed!`);
  console.log(`Status: ${game.status}`);
  console.log(
    `🏆 Final Podium Standings:`,
    game.winner_ranks.map(
      (s: number, idx: number) => `Rank #${idx + 1}: ${names[s]} (Seat ${s})`
    )
  );

  const results = await pb1.collection('results').getFullList({
    filter: `game_id="${gameId}"`,
  });
  console.log(`✅ Results Records Recorded: ${results.length} / 4`);

  if (results.length === 4 && game.status === 'finished') {
    console.log('\n======================================================');
    console.log('🌟 4-HUMAN MULTIPLAYER END-TO-END TEST PASSED 100%! 🌟');
    console.log('======================================================\n');
  } else {
    throw new Error('Game did not produce 4 result records or status is not finished');
  }
}

runMultiplayerTest().catch((err) => {
  console.error('Multiplayer test error:', err);
  process.exit(1);
});
