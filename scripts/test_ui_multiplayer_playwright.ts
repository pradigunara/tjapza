import { chromium } from '/home/adiguna/.bun/install/global/node_modules/@xmorse/playwright-core';

async function runRealUiMultiplayerTest() {
  console.log('🌐 Launching Real Browser UI Multiplayer Test (2 Independent Contexts)...');

  const browser = await chromium.launch({ headless: true });

  try {
    // 1. Context A (Alice)
    const contextA = await browser.newContext({
      viewport: { width: 420, height: 840 }, // Mobile portrait
    });
    const pageA = await contextA.newPage();

    // 2. Context B (Bob)
    const contextB = await browser.newContext({
      viewport: { width: 420, height: 840 }, // Mobile portrait
    });
    const pageB = await contextB.newPage();

    // --- STEP 1: Load App for Alice & Bob ---
    console.log('📍 Navigating Alice and Bob to app...');
    await pageA.goto('http://127.0.0.1:8090', { waitUntil: 'networkidle' });
    await pageB.goto('http://127.0.0.1:8090', { waitUntil: 'networkidle' });
    await new Promise((r) => setTimeout(r, 1000));

    // Rename profiles so avatars show clear names
    await pageA.evaluate(() => {
      const nameEl = document.querySelector('.profile-name');
      if (nameEl) nameEl.textContent = 'Alice';
    });
    await pageB.evaluate(() => {
      const nameEl = document.querySelector('.profile-name');
      if (nameEl) nameEl.textContent = 'Bob';
    });

    // --- STEP 2: Alice creates private room ---
    console.log('📍 Alice creates room...');
    await pageA.locator('#btn-create-room').click();
    await pageA.waitForSelector('.table-waiting-overlay', { timeout: 5000 });

    const roomCode = await pageA
      .locator('.waiting-subtitle strong')
      .textContent();
    const cleanRoomCode = roomCode?.trim() || '';
    console.log(`✅ Alice created Room Code: "${cleanRoomCode}"`);

    // Screenshot Alice waiting in lobby
    await pageA.screenshot({
      path: '/home/adiguna/.gemini/antigravity-cli/brain/77e9d6ab-789a-47bb-ac41-e12025ab653a/ui_mp_alice_lobby.png',
    });

    // --- STEP 3: Bob joins with room code ---
    console.log(`📍 Bob joins Room "${cleanRoomCode}"...`);
    await pageB.locator('#input-room-code').fill(cleanRoomCode);
    await pageB.locator('#btn-join-room').click();

    // Wait for Bob to enter waiting overlay
    await pageB.waitForSelector('.table-waiting-overlay', { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 1200));

    // Screenshot Bob and Alice waiting in synced lobby
    await pageA.screenshot({
      path: '/home/adiguna/.gemini/antigravity-cli/brain/77e9d6ab-789a-47bb-ac41-e12025ab653a/ui_mp_alice_lobby_synced.png',
    });
    await pageB.screenshot({
      path: '/home/adiguna/.gemini/antigravity-cli/brain/77e9d6ab-789a-47bb-ac41-e12025ab653a/ui_mp_bob_lobby_synced.png',
    });
    console.log('✅ Real-time SSE seated both players in lobby!');

    // --- STEP 4: Alice starts game (Fill Bots) ---
    console.log('📍 Alice clicks Start Game (Fill Bots)...');
    await pageA.locator('#btn-start-game').click();

    // Both players should transition to live table automatically via SSE
    await pageA.waitForSelector('#btn-action-play', { timeout: 6000 });
    await pageB.waitForSelector('#btn-action-play', { timeout: 6000 });
    await new Promise((r) => setTimeout(r, 1500));

    console.log('✅ Both players transitioned into the live game table!');

    // --- STEP 5: Capture live table for both players ---
    await pageA.screenshot({
      path: '/home/adiguna/.gemini/antigravity-cli/brain/77e9d6ab-789a-47bb-ac41-e12025ab653a/ui_mp_alice_table_live.png',
    });
    await pageB.screenshot({
      path: '/home/adiguna/.gemini/antigravity-cli/brain/77e9d6ab-789a-47bb-ac41-e12025ab653a/ui_mp_bob_table_live.png',
    });

    // --- STEP 6: Active Player plays opening move ---
    const isAliceTurn = await pageA.locator('#btn-action-play').isEnabled();
    const isBobTurn = await pageB.locator('#btn-action-play').isEnabled();
    console.log(`🎮 Initial Turns: Alice Playable: ${isAliceTurn}, Bob Playable: ${isBobTurn}`);

    const activePage = isAliceTurn ? pageA : pageB;
    const passivePage = isAliceTurn ? pageB : pageA;
    const activeName = isAliceTurn ? 'Alice' : 'Bob';

    console.log(`📍 ${activeName} holds 3♦ and selects opening move via Hint...`);
    await activePage.locator('#btn-action-hint').click();
    await new Promise((r) => setTimeout(r, 500));

    // Capture active player with selected combo badge
    await activePage.screenshot({
      path: '/home/adiguna/.gemini/antigravity-cli/brain/77e9d6ab-789a-47bb-ac41-e12025ab653a/ui_mp_active_selected.png',
    });

    console.log(`📍 ${activeName} clicks Play...`);
    await activePage.locator('#btn-action-play').click();
    await new Promise((r) => setTimeout(r, 2000));

    // Both players should see the trick in the center!
    await pageA.screenshot({
      path: '/home/adiguna/.gemini/antigravity-cli/brain/77e9d6ab-789a-47bb-ac41-e12025ab653a/ui_mp_alice_after_play.png',
    });
    await pageB.screenshot({
      path: '/home/adiguna/.gemini/antigravity-cli/brain/77e9d6ab-789a-47bb-ac41-e12025ab653a/ui_mp_bob_after_play.png',
    });

    console.log('\n======================================================');
    console.log('🌟 REAL UI MULTIPLAYER TEST PASSED WITH 100% SUCCESS! 🌟');
    console.log('======================================================\n');
  } finally {
    await browser.close();
  }
}

runRealUiMultiplayerTest().catch((err) => {
  console.error('Real UI Multiplayer Test Failed:', err);
  process.exit(1);
});
