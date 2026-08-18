/// <reference path="../pb_data/types.d.ts" />

// ----------------------------------------------------
// CUSTOM ROUTES
// ----------------------------------------------------

/**
 * POST /api/tjapza/room/create
 * Creates a new game room.
 */
routerAdd("POST", "/api/tjapza/room/create", (c) => {
    var cards = require(__hooks + "/cards.js");
    var auth = c.auth;
    if (!auth) {
        return c.unauthorizedError("Authentication required to create a room");
    }

    var reqInfo = c.requestInfo();
    var body = reqInfo.body || {};
    var isPublic = !!body.is_public;

    var roomCode = cards.generateRoomCode();
    var displayName = auth.get("display_name") || auth.get("name") || auth.get("email") || "Player 1";

    var seat0 = {
        user_id: auth.id,
        name: displayName,
        is_bot: false,
        connected: true
    };

    var gamesColl = $app.findCollectionByNameOrId("games");
    var game = new Record(gamesColl, {
        status: "waiting",
        room_code: roomCode,
        is_public: isPublic,
        seats: [seat0, null, null, null],
        turn_index: 0,
        leader_index: 0,
        last_combo: null,
        pass_count: 0,
        counts: [13, 13, 13, 13],
        winner_ranks: [],
        turn_started_at: ""
    });

    $app.save(game);

    return c.json(200, {
        game: game,
        seat_index: 0
    });
}, $apis.requireAuth());

/**
 * POST /api/tjapza/room/join
 * Joins an existing game room by room_code or game_id.
 */
routerAdd("POST", "/api/tjapza/room/join", (c) => {
    var cards = require(__hooks + "/cards.js");
    var auth = c.auth;
    if (!auth) {
        return c.unauthorizedError("Authentication required to join a room");
    }

    var reqInfo = c.requestInfo();
    var body = reqInfo.body || {};
    var roomCode = body.room_code ? String(body.room_code).toUpperCase().trim() : "";
    var gameId = body.game_id ? String(body.game_id).trim() : "";

    var game = null;
    if (gameId) {
        try {
            game = $app.findRecordById("games", gameId);
        } catch (e) {}
    } else if (roomCode) {
        try {
            game = $app.findFirstRecordByFilter("games", "room_code = {:code} && status = 'waiting'", { code: roomCode });
        } catch (e) {}
    }

    if (!game) {
        return c.notFoundError("Room not found or no longer waiting for players");
    }

    if (game.getString("status") !== "waiting") {
        return c.badRequestError("Game is already in progress or finished");
    }

    var seats = cards.getRecordJSON(game, "seats", []);
    var displayName = auth.get("display_name") || auth.get("name") || auth.get("email") || "Player";

    // Check if user is already seated
    for (var i = 0; i < 4; i++) {
        if (seats[i] && seats[i].user_id === auth.id) {
            return c.json(200, {
                game: game,
                seat_index: i
            });
        }
    }

    // Find first empty seat
    var emptySeat = -1;
    for (var j = 0; j < 4; j++) {
        if (!seats[j] || !seats[j].user_id) {
            emptySeat = j;
            break;
        }
    }

    if (emptySeat === -1) {
        return c.badRequestError("Room is full");
    }

    seats[emptySeat] = {
        user_id: auth.id,
        name: displayName,
        is_bot: false,
        connected: true
    };

    game.set("seats", seats);
    $app.save(game);

    return c.json(200, {
        game: game,
        seat_index: emptySeat
    });
}, $apis.requireAuth());

/**
 * POST /api/tjapza/room/start
 * Starts a waiting game. Any empty seats are filled with deterministic bots.
 */
routerAdd("POST", "/api/tjapza/room/start", (c) => {
    var cards = require(__hooks + "/cards.js");
    var auth = c.auth;
    if (!auth) {
        return c.unauthorizedError("Authentication required to start room");
    }

    var reqInfo = c.requestInfo();
    var body = reqInfo.body || {};
    var gameId = body.game_id ? String(body.game_id).trim() : "";

    if (!gameId) {
        return c.badRequestError("game_id is required");
    }

    var game = null;
    try {
        game = $app.findRecordById("games", gameId);
    } catch (e) {
        return c.notFoundError("Game not found");
    }

    if (game.getString("status") !== "waiting") {
        return c.badRequestError("Game is not in waiting state");
    }

    var seats = cards.getRecordJSON(game, "seats", []);

    // Determine current room host (lowest occupied human seat)
    var hostSeatIndex = -1;
    for (var k = 0; k < 4; k++) {
        if (seats[k] && seats[k].user_id && !seats[k].is_bot) {
            hostSeatIndex = k;
            break;
        }
    }

    var isPublic = game.getBool("is_public");
    var createdTime = new Date(game.getString("created")).getTime();
    var isPublicTimedOut = isPublic && (Date.now() - createdTime >= 30000);

    // Host can always start; In public rooms, any seated player can start after 30s countdown
    var isCallerHost = (hostSeatIndex !== -1 && seats[hostSeatIndex].user_id === auth.id);
    var isCallerSeated = false;
    for (var s = 0; s < 4; s++) {
        if (seats[s] && seats[s].user_id === auth.id) {
            isCallerSeated = true;
            break;
        }
    }

    if (!isCallerHost && !(isPublicTimedOut && isCallerSeated)) {
        return c.forbiddenError("Only the room host can start the game (or auto-start after 30s in public matches)");
    }

    // Fill empty seats with bots
    for (var i = 0; i < 4; i++) {
        if (!seats[i] || !seats[i].user_id) {
            seats[i] = {
                user_id: null,
                name: "Bot " + (i + 1),
                is_bot: true,
                connected: true
            };
        }
    }
    game.set("seats", seats);

    cards.dealAndStartGame(game);

    return c.json(200, {
        game: game
    });
}, $apis.requireAuth());

/**
 * POST /api/tjapza/quickplay
 * Quick matchmaking: joins an open public game or creates a new one.
 */
routerAdd("POST", "/api/tjapza/quickplay", (c) => {
    var cards = require(__hooks + "/cards.js");
    var auth = c.auth;
    if (!auth) {
        return c.unauthorizedError("Authentication required for quickplay");
    }

    var displayName = auth.get("display_name") || auth.get("name") || auth.get("email") || "Player";

    // Look for public waiting games with available seats
    var candidateGames = [];
    try {
        candidateGames = $app.findRecordsByFilter("games", "is_public = true && status = 'waiting'", "-created", 20, 0);
    } catch (e) {}

    for (var i = 0; i < candidateGames.length; i++) {
        var g = candidateGames[i];
        var seats = cards.getRecordJSON(g, "seats", []);

        // Check if user is already in this game
        var alreadyIn = false;
        var openSeat = -1;
        for (var s = 0; s < 4; s++) {
            if (seats[s] && seats[s].user_id === auth.id) {
                alreadyIn = true;
                openSeat = s;
                break;
            }
            if (!seats[s] || !seats[s].user_id) {
                if (openSeat === -1) openSeat = s;
            }
        }

        if (alreadyIn) {
            return c.json(200, {
                game: g,
                seat_index: openSeat
            });
        }

        if (openSeat !== -1) {
            seats[openSeat] = {
                user_id: auth.id,
                name: displayName,
                is_bot: false,
                connected: true
            };
            g.set("seats", seats);

            // If this was the 4th player, auto-start
            var totalSeated = 0;
            for (var m = 0; m < 4; m++) {
                if (seats[m] && seats[m].user_id) totalSeated++;
            }

            if (totalSeated === 4) {
                cards.dealAndStartGame(g);
            } else {
                $app.save(g);
            }

            return c.json(200, {
                game: g,
                seat_index: openSeat
            });
        }
    }

    // No available room found, create a new public room
    var roomCode = cards.generateRoomCode();
    var seat0 = {
        user_id: auth.id,
        name: displayName,
        is_bot: false,
        connected: true
    };

    var gamesColl = $app.findCollectionByNameOrId("games");
    var newGame = new Record(gamesColl, {
        status: "waiting",
        room_code: roomCode,
        is_public: true,
        seats: [seat0, null, null, null],
        turn_index: 0,
        leader_index: 0,
        last_combo: null,
        pass_count: 0,
        counts: [13, 13, 13, 13],
        winner_ranks: [],
        turn_started_at: ""
    });

    $app.save(newGame);

    return c.json(200, {
        game: newGame,
        seat_index: 0
    });
}, $apis.requireAuth());

/**
 * POST /api/tjapza/rematch
 * Creates a new game record with the same room participants after a game finishes.
 */
routerAdd("POST", "/api/tjapza/rematch", (c) => {
    var cards = require(__hooks + "/cards.js");
    var auth = c.auth;
    if (!auth) {
        return c.unauthorizedError("Authentication required for rematch");
    }

    var reqInfo = c.requestInfo();
    var body = reqInfo.body || {};
    var gameId = body.game_id ? String(body.game_id).trim() : "";

    if (!gameId) {
        return c.badRequestError("game_id is required");
    }

    var oldGame = null;
    try {
        oldGame = $app.findRecordById("games", gameId);
    } catch (e) {
        return c.notFoundError("Original game not found");
    }

    if (oldGame.getString("status") !== "finished") {
        return c.badRequestError("Game is not finished yet");
    }

    var oldSeats = cards.getRecordJSON(oldGame, "seats", []);
    var isParticipant = false;
    for (var i = 0; i < 4; i++) {
        if (oldSeats[i] && oldSeats[i].user_id === auth.id) {
            isParticipant = true;
            break;
        }
    }
    if (!isParticipant) {
        return c.forbiddenError("You were not a participant in this game");
    }

    // If a rematch game was already created for this old game, return it
    var existingRematchId = oldGame.getString("rematch_game_id");
    if (existingRematchId) {
        try {
            var existingGame = $app.findRecordById("games", existingRematchId);
            return c.json(200, {
                game: existingGame
            });
        } catch (e) {}
    }

    // Preserve players and create a fresh game record
    var newSeats = [];
    for (var j = 0; j < 4; j++) {
        var s = oldSeats[j];
        if (s) {
            newSeats.push({
                user_id: s.user_id,
                name: s.name,
                is_bot: s.is_bot,
                connected: true
            });
        } else {
            newSeats.push(null);
        }
    }

    var gamesColl = $app.findCollectionByNameOrId("games");
    var newGame = new Record(gamesColl, {
        status: "waiting",
        room_code: oldGame.getString("room_code") || cards.generateRoomCode(),
        is_public: oldGame.getBool("is_public"),
        seats: newSeats,
        turn_index: 0,
        leader_index: 0,
        last_combo: null,
        pass_count: 0,
        counts: [13, 13, 13, 13],
        winner_ranks: [],
        turn_started_at: ""
    });

    $app.save(newGame);

    // Auto-deal and start if all 4 seats are occupied
    var totalSeated = 0;
    for (var n = 0; n < 4; n++) {
        if (newSeats[n]) totalSeated++;
    }
    if (totalSeated === 4) {
        cards.dealAndStartGame(newGame);
    }

    // Link rematch_game_id to oldGame and save so all SSE listeners navigate together
    try {
        oldGame.set("rematch_game_id", newGame.id);
        $app.save(oldGame);
    } catch (saveErr) {}

    return c.json(200, {
        game: newGame
    });
}, $apis.requireAuth());

// ----------------------------------------------------
// AUTHORITATIVE MOVE HOOK (onRecordCreateRequest('moves'))
// ----------------------------------------------------

onRecordCreateRequest((e) => {
    try {
        var cards = require(__hooks + "/cards.js");
        var moveRecord = e.record;
        var gameId = moveRecord.getString("game_id");
        var action = moveRecord.getString("action");
        var seatIndex = moveRecord.getInt("seat_index");
        var cardsPlayed = cards.getRecordJSON(moveRecord, "cards", []);

        if (action !== "play" && action !== "pass" && action !== "tick") {
            throw new BadRequestError("Invalid action type: " + action);
        }

        var game = null;
        try {
            game = $app.findRecordById("games", gameId);
        } catch (err) {
            throw new BadRequestError("Game not found");
        }

        if (game.getString("status") !== "playing") {
            throw new BadRequestError("Game is not in playing state");
        }

        var currentTurn = game.getInt("turn_index");

        // If action is tick, automatically sync seatIndex with the authoritative server turn
        if (action === "tick") {
            seatIndex = currentTurn;
            moveRecord.set("seat_index", currentTurn);
        }

        if (typeof seatIndex !== "number" || seatIndex < 0 || seatIndex > 3) {
            throw new BadRequestError("Invalid seat_index: " + seatIndex);
        }
        var leaderIndex = game.getInt("leader_index");
        var passCount = game.getInt("pass_count");
        var passedSeats = cards.getRecordJSON(game, "passed_seats", []);
        var counts = cards.getRecordJSON(game, "counts", [13, 13, 13, 13]);
        var lastCombo = cards.getRecordJSON(game, "last_combo", null);
        var winnerRanks = cards.getRecordJSON(game, "winner_ranks", []);
        var seats = cards.getRecordJSON(game, "seats", []);
        var currentSeat = seats[currentTurn];
        var turnStartedAt = game.getString("turn_started_at");
        if (cards.isComboEmpty(lastCombo)) {
            lastCombo = null;
        }

        // Check if opening move of the game
        var isOpeningMove = (lastCombo == null && counts[0] === 13 && counts[1] === 13 && counts[2] === 13 && counts[3] === 13);

        // 1. Handle TICK Action (Bot move or turn timer timeout auto-play)
        if (action === "tick") {
            var isBotTurn = currentSeat && currentSeat.is_bot === true;
            var isTimeout = false;

            if (!isBotTurn && turnStartedAt) {
                var nowTime = Date.now();
                var startTime = new Date(turnStartedAt).getTime();
                var timeoutLimit = cards.TURN_TIMEOUT_MS || 60000;
                if (nowTime - startTime >= timeoutLimit) { // turn timer expired
                    isTimeout = true;
                }
            }

            if (!isBotTurn && !isTimeout) {
                throw new BadRequestError("Not a bot turn and human player has not timed out");
            }

            // Fetch hand of current turn player
            var currentHandRecord = null;
            try {
                currentHandRecord = $app.findFirstRecordByFilter("hands", "game_id = {:gameId} && seat_index = {:seat}", {
                    gameId: gameId,
                    seat: currentTurn
                });
            } catch (hErr) {
                throw new BadRequestError("Hand not found for seat " + currentTurn);
            }

            var botHandCards = cards.getRecordJSON(currentHandRecord, "cards", []);
            var botDecision = cards.getBotMove(botHandCards, lastCombo, isOpeningMove, counts);

            action = botDecision.action;
            seatIndex = currentTurn;
            moveRecord.set("seat_index", currentTurn);
            moveRecord.set("action", action);

            if (action === "play") {
                cardsPlayed = botDecision.cards;
                moveRecord.set("cards", cardsPlayed);
            } else {
                cardsPlayed = [];
                moveRecord.set("cards", []);
            }
        }

        var isTimeoutTick = (moveRecord.getString("action") === "tick" && isTimeout);

        // 2. Handle PLAY Action
        var playedCombo = null;
        var playerHandRecord = null;
        var playerHandCards = [];

        if (action === "play") {
            // Validation: verify turn
            if (seatIndex !== currentTurn) {
                throw new BadRequestError("Not your turn to play");
            }

            // If direct human action (not a timeout tick), verify authentication matches seat
            if (!isTimeoutTick && e.auth && currentSeat && !currentSeat.is_bot) {
                if (currentSeat.user_id !== e.auth.id) {
                    throw new ForbiddenError("You are not authorized to play for this seat");
                }
            }

            // Fetch player hand
            try {
                playerHandRecord = $app.findFirstRecordByFilter("hands", "game_id = {:gameId} && seat_index = {:seat}", {
                    gameId: gameId,
                    seat: seatIndex
                });
            } catch (hErr2) {
                throw new BadRequestError("Hand record not found");
            }

            playerHandCards = cards.getRecordJSON(playerHandRecord, "cards", []);

            // Verify player actually holds the played cards (Array check, valid length, bounds, and uniqueness)
            if (!Array.isArray(cardsPlayed) || (cardsPlayed.length !== 1 && cardsPlayed.length !== 2 && cardsPlayed.length !== 5)) {
                throw new BadRequestError("Invalid number of cards played (must be 1, 2, or 5)");
            }

            var seenCards = {};
            for (var c = 0; c < cardsPlayed.length; c++) {
                var cardNum = cardsPlayed[c];
                if (typeof cardNum !== "number" || cardNum < 0 || cardNum > 51 || Math.floor(cardNum) !== cardNum) {
                    throw new BadRequestError("Invalid card code: " + cardNum);
                }
                if (seenCards[cardNum]) {
                    throw new BadRequestError("Duplicate card submitted in combo: " + cardNum);
                }
                seenCards[cardNum] = true;
                if (playerHandCards.indexOf(cardNum) === -1) {
                    throw new BadRequestError("Card not in hand: " + cardNum);
                }
            }

            // Opening move check: must include 3 of Diamonds (code 0)
            if (isOpeningMove && cardsPlayed.indexOf(0) === -1) {
                throw new BadRequestError("Opening move must include 3 of Diamonds (3♦)");
            }

            // Evaluate combo
            playedCombo = cards.evaluateCombo(cardsPlayed);
            if (!playedCombo || !playedCombo.valid) {
                throw new BadRequestError("Invalid card combination");
            }

            // Check if beats last_combo
            if (lastCombo && !cards.canBeat(playedCombo, lastCombo)) {
                throw new BadRequestError("Played combination does not beat the current pile");
            }

            // Set combo fields on move record
            moveRecord.set("combo_type", playedCombo.type);
            moveRecord.set("combo_power", playedCombo.power);
            moveRecord.set("cards", cards.sortCards(cardsPlayed));
        } else if (action === "pass") {
            // Validation: verify turn
            if (seatIndex !== currentTurn) {
                throw new BadRequestError("Not your turn to pass");
            }

            // If direct human action, verify auth
            if (!isTimeoutTick && e.auth && currentSeat && !currentSeat.is_bot) {
                if (currentSeat.user_id !== e.auth.id) {
                    throw new ForbiddenError("You are not authorized to pass for this seat");
                }
            }

            // Cannot pass when leading a trick
            if (!lastCombo) {
                throw new BadRequestError("Cannot pass when leading a trick");
            }

            // Cannot pass on opening move
            if (isOpeningMove) {
                throw new BadRequestError("Cannot pass on the opening move of the game");
            }

            moveRecord.set("cards", []);
            moveRecord.set("combo_type", "");
            moveRecord.set("combo_power", 0);
        } else {
            throw new BadRequestError("Unknown move action: " + action);
        }

        // ----------------------------------------------------
        // ATOMIC STATE MUTATIONS
        // ----------------------------------------------------

        if (action === "play") {
            // 1. Remove cards from hand
            var remainingCards = playerHandCards.filter(function(card) {
                return cardsPlayed.indexOf(card) === -1;
            });
            playerHandRecord.set("cards", cards.sortCards(remainingCards));
            $app.save(playerHandRecord);

            // 2. Update counts and last_combo
            counts[seatIndex] = remainingCards.length;
            game.set("counts", counts);
            game.set("last_combo", {
                type: playedCombo.type,
                power: playedCombo.power,
                cards: cards.sortCards(cardsPlayed),
                seat_index: seatIndex
            });
            game.set("pass_count", 0);

            // 3. Shedding & Ranking Check
            if (remainingCards.length === 0) {
                var playerRank = winnerRanks.length + 1;
                winnerRanks.push(seatIndex);
                game.set("winner_ranks", winnerRanks);

                // Record result
                var resultsColl = $app.findCollectionByNameOrId("results");
                var resultRec = new Record(resultsColl, {
                    game_id: game.id,
                    user_id: (currentSeat && currentSeat.user_id) ? currentSeat.user_id : null,
                    seat_index: seatIndex,
                    rank: playerRank,
                    is_bot: !!(currentSeat && currentSeat.is_bot)
                });
                $app.save(resultRec);

                // Count remaining active players
                var activeSeats = [];
                for (var a = 0; a < 4; a++) {
                    if (counts[a] > 0) activeSeats.push(a);
                }

                if (activeSeats.length === 1) {
                    // Game finished! Last remaining player takes 4th place
                    var lastPlayerSeat = activeSeats[0];
                    winnerRanks.push(lastPlayerSeat);
                    game.set("winner_ranks", winnerRanks);
                    game.set("status", "finished");

                    var lastSeatInfo = seats[lastPlayerSeat];
                    var lastResult = new Record(resultsColl, {
                        game_id: game.id,
                        user_id: (lastSeatInfo && lastSeatInfo.user_id) ? lastSeatInfo.user_id : null,
                        seat_index: lastPlayerSeat,
                        rank: 4,
                        is_bot: !!(lastSeatInfo && lastSeatInfo.is_bot)
                    });
                    $app.save(lastResult);

                    // Ephemeral cleanup: Purge temporary hands for this finished game
                    try {
                        var finishedHands = $app.findRecordsByFilter("hands", "game_id = {:gid}", "-created", 10, 0, { gid: game.id });
                        for (var fh = 0; fh < finishedHands.length; fh++) {
                            $app.delete(finishedHands[fh]);
                        }
                    } catch (eHands) {}
                }
            }

            // If game is still active, advance turn to next eligible player clockwise (skipping passed players)
            if (game.getString("status") === "playing") {
                var nextTurn = cards.findNextTrickSeat(counts, passedSeats, seatIndex, seatIndex);
                if (nextTurn === -1) {
                    // All other active players have already passed in this trick: trick ends immediately!
                    game.set("last_combo", null);
                    game.set("passed_seats", []);
                    game.set("pass_count", 0);
                    if (counts[seatIndex] > 0) {
                        game.set("turn_index", seatIndex);
                        game.set("leader_index", seatIndex);
                    } else {
                        var clockwiseLeader = cards.findNextActiveSeat(counts, seatIndex);
                        game.set("turn_index", clockwiseLeader);
                        game.set("leader_index", clockwiseLeader);
                    }
                } else {
                    game.set("passed_seats", passedSeats);
                    game.set("turn_index", nextTurn);
                }
                game.set("turn_started_at", new Date().toISOString());
            }

            $app.save(game);
        } else if (action === "pass") {
            if (passedSeats.indexOf(seatIndex) === -1) {
                passedSeats.push(seatIndex);
            }
            var newPassCount = passCount + 1;
            game.set("pass_count", newPassCount);

            var trickWinnerSeat = lastCombo ? lastCombo.seat_index : seatIndex;
            var nextActiveTurn = cards.findNextTrickSeat(counts, passedSeats, seatIndex, trickWinnerSeat);

            // If no other eligible player remains, trick ends!
            if (nextActiveTurn === -1) {
                game.set("last_combo", null);
                game.set("passed_seats", []);
                game.set("pass_count", 0);

                // If trick winner still has cards, they lead
                if (counts[trickWinnerSeat] > 0) {
                    game.set("turn_index", trickWinnerSeat);
                    game.set("leader_index", trickWinnerSeat);
                } else {
                    // Post-shed lead priority: handover to next active player clockwise from winner
                    var clockwiseLeader2 = cards.findNextActiveSeat(counts, trickWinnerSeat);
                    game.set("turn_index", clockwiseLeader2);
                    game.set("leader_index", clockwiseLeader2);
                }
            } else {
                // Trick continues: advance turn to next eligible active player clockwise
                game.set("passed_seats", passedSeats);
                game.set("turn_index", nextActiveTurn);
            }

            game.set("turn_started_at", new Date().toISOString());
            $app.save(game);
        }

        return e.next();
    } catch (err) {
        console.error("MOVE_HOOK_ERROR:", err);
        throw err;
    }
}, "moves");

// ----------------------------------------------------
// CRON: EPHEMERAL DATA CLEANUP
// ----------------------------------------------------
// Runs every 10 minutes to purge temporary moves, hands, and abandoned games,
// while permanently preserving user profiles and lifetime results/stats.
cronAdd("tjapzaEphemeralCleanup", "*/10 * * * *", () => {
    try {
        // 1. Purge ephemeral moves older than 15 minutes
        var movesCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        var oldMoves = $app.findRecordsByFilter("moves", "created < {:cutoff}", "-created", 300, 0, { cutoff: movesCutoff });
        for (var m = 0; m < oldMoves.length; m++) {
            try { $app.delete(oldMoves[m]); } catch (_) {}
        }

        // 2. Purge ephemeral hands older than 30 minutes
        var handsCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        var oldHands = $app.findRecordsByFilter("hands", "created < {:cutoff}", "-created", 100, 0, { cutoff: handsCutoff });
        for (var h = 0; h < oldHands.length; h++) {
            try { $app.delete(oldHands[h]); } catch (_) {}
        }

        // 3. Purge abandoned waiting games older than 30 minutes
        var waitingCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        var abandonedGames = $app.findRecordsByFilter("games", "status = 'waiting' && created < {:cutoff}", "-created", 50, 0, { cutoff: waitingCutoff });
        for (var ag = 0; ag < abandonedGames.length; ag++) {
            try { $app.delete(abandonedGames[ag]); } catch (_) {}
        }

        // 4. Purge finished games older than 2 hours (results records are preserved for lifetime player statistics)
        var finishedCutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        var oldFinishedGames = $app.findRecordsByFilter("games", "status = 'finished' && updated < {:cutoff}", "-created", 50, 0, { cutoff: finishedCutoff });
        for (var fg = 0; fg < oldFinishedGames.length; fg++) {
            try { $app.delete(oldFinishedGames[fg]); } catch (_) {}
        }
    } catch (cronErr) {
        console.error("CRON_CLEANUP_ERROR:", cronErr);
    }
});

