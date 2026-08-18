/// <reference path="../pb_data/types.d.ts" />

// ----------------------------------------------------
// CUSTOM ROUTES
// ----------------------------------------------------

/**
 * POST /api/tjapza/room/create
 * Creates a new game room.
 */
routerAdd("POST", "/api/tjapza/room/create", (c) => {
    try {
        var domain = require(__hooks + "/domain.js");
        var auth = c.auth;
        if (!auth) {
            return c.unauthorizedError("Authentication required to create a room");
        }

        var reqInfo = c.requestInfo();
        var body = reqInfo.body || {};
        var isPublic = !!body.is_public;

        var roomCode = domain.RoomCode.generate().value;
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
    } catch (err) {
        console.error("ROOM_CREATE_ERR:", err);
        return c.badRequestError(err.message || String(err));
    }
}, $apis.requireAuth());

/**
 * POST /api/tjapza/room/join
 * Joins an existing game room by room_code or game_id.
 */
routerAdd("POST", "/api/tjapza/room/join", (c) => {
    try {
        var domain = require(__hooks + "/domain.js");
        var auth = c.auth;
        if (!auth) {
            return c.unauthorizedError("Authentication required to join a room");
        }

        var reqInfo = c.requestInfo();
        var body = reqInfo.body || {};
        var roomCode = body.room_code ? domain.RoomCode.clean(body.room_code) : "";
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

        var seats = domain.parseJSON(game.get("seats"), []);
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
        var targetSeat = -1;
        for (var s = 0; s < 4; s++) {
            if (!seats[s] || (!seats[s].user_id && !seats[s].is_bot)) {
                targetSeat = s;
                break;
            }
        }

        if (targetSeat === -1) {
            return c.badRequestError("Room is already full");
        }

        seats[targetSeat] = {
            user_id: auth.id,
            name: displayName,
            is_bot: false,
            connected: true
        };

        game.set("seats", seats);
        $app.save(game);

        return c.json(200, {
            game: game,
            seat_index: targetSeat
        });
    } catch (err) {
        console.error("ROOM_JOIN_ERR:", err);
        return c.badRequestError(err.message || String(err));
    }
}, $apis.requireAuth());

/**
 * POST /api/tjapza/room/start
 * Starts game early, filling any remaining empty seats with bots.
 */
routerAdd("POST", "/api/tjapza/room/start", (c) => {
    try {
        var domain = require(__hooks + "/domain.js");
        var gameService = require(__hooks + "/game_service.js");
        var auth = c.auth;
        if (!auth) {
            return c.unauthorizedError("Authentication required to start the game");
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

        var seats = domain.parseJSON(game.get("seats"), []);
        var domainRoom = new domain.Room({
            id: game.id,
            code: game.getString("room_code"),
            status: "waiting",
            seats: seats
        });

        var hostIndex = domainRoom.hostSeatIndex;
        if (hostIndex === -1 || !seats[hostIndex] || seats[hostIndex].user_id !== auth.id) {
            return c.forbiddenError("Only the room host can start the game");
        }

        // Fill remaining empty slots with bots
        var botNames = ["Bot Alpha", "Bot Bravo", "Bot Charlie", "Bot Delta"];
        for (var i = 0; i < 4; i++) {
            if (!seats[i] || (!seats[i].user_id && !seats[i].is_bot)) {
                seats[i] = {
                    user_id: null,
                    name: botNames[i] || ("Bot " + (i + 1)),
                    is_bot: true,
                    connected: true
                };
            }
        }

        game.set("seats", seats);
        $app.save(game);

        // Deal cards and transition to playing state
        gameService.dealAndStartGame(game);

        return c.json(200, {
            game: game
        });
    } catch (err) {
        console.error("ROOM_START_ERR:", err);
        return c.badRequestError(err.message || String(err));
    }
}, $apis.requireAuth());

/**
 * POST /api/tjapza/quickplay
 * Finds an open public game room or creates a new one.
 */
routerAdd("POST", "/api/tjapza/quickplay", (c) => {
    try {
        var domain = require(__hooks + "/domain.js");
        var gameService = require(__hooks + "/game_service.js");
        var auth = c.auth;
        if (!auth) {
            return c.unauthorizedError("Authentication required for quickplay");
        }

        var displayName = auth.get("display_name") || auth.get("name") || auth.get("email") || "Player";

        // 1. Find public waiting games
        var openGames = [];
        try {
            openGames = $app.findRecordsByFilter("games", "is_public = true && status = 'waiting'", "-created", 10, 0);
        } catch (e) {}

        for (var i = 0; i < openGames.length; i++) {
            var g = openGames[i];
            var seats = domain.parseJSON(g.get("seats"), []);

            // Check if user is already in this game
            for (var s = 0; s < 4; s++) {
                if (seats[s] && seats[s].user_id === auth.id) {
                    return c.json(200, {
                        game: g,
                        seat_index: s
                    });
                }
            }

            // Find empty slot
            for (var s2 = 0; s2 < 4; s2++) {
                if (!seats[s2] || (!seats[s2].user_id && !seats[s2].is_bot)) {
                    seats[s2] = {
                        user_id: auth.id,
                        name: displayName,
                        is_bot: false,
                        connected: true
                    };
                    g.set("seats", seats);
                    $app.save(g);

                    // If room is now full (4 humans), start immediately
                    var humanCount = 0;
                    for (var h = 0; h < 4; h++) {
                        if (seats[h] && seats[h].user_id && !seats[h].is_bot) {
                            humanCount++;
                        }
                    }

                    if (humanCount === 4) {
                        gameService.dealAndStartGame(g);
                    }

                    return c.json(200, {
                        game: g,
                        seat_index: s2
                    });
                }
            }
        }

        // 2. No open game found: create new public waiting room
        var roomCode = domain.RoomCode.generate().value;
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
            turn_started_at: new Date().toISOString()
        });

        $app.save(newGame);

        return c.json(200, {
            game: newGame,
            seat_index: 0
        });
    } catch (err) {
        console.error("QUICKPLAY_ERR:", err);
        return c.badRequestError(err.message || String(err));
    }
}, $apis.requireAuth());

/**
 * POST /api/tjapza/rematch
 * Initiates a rematch for all players in the completed room.
 */
routerAdd("POST", "/api/tjapza/rematch", (c) => {
    try {
        var domain = require(__hooks + "/domain.js");
        var gameService = require(__hooks + "/game_service.js");
        var auth = c.auth;
        if (!auth) {
            return c.unauthorizedError("Authentication required for rematch");
        }

        var reqInfo = c.requestInfo();
        var body = reqInfo.body || {};
        var oldGameId = body.game_id ? String(body.game_id).trim() : "";

        if (!oldGameId) {
            return c.badRequestError("game_id is required");
        }

        var oldGame = null;
        try {
            oldGame = $app.findRecordById("games", oldGameId);
        } catch (e) {
            return c.notFoundError("Original game not found");
        }

        if (oldGame.getString("status") !== "finished") {
            return c.badRequestError("Can only rematch finished games");
        }

        // Idempotency check: if another player already created a rematch game, return it
        var existingRematchId = oldGame.getString("rematch_game_id");
        if (existingRematchId) {
            try {
                var existingGame = $app.findRecordById("games", existingRematchId);
                var mySeat = -1;
                var exSeats = domain.parseJSON(existingGame.get("seats"), []);
                for (var s = 0; s < 4; s++) {
                    if (exSeats[s] && exSeats[s].user_id === auth.id) {
                        mySeat = s;
                        break;
                    }
                }
                return c.json(200, {
                    game: existingGame,
                    seat_index: mySeat >= 0 ? mySeat : 0
                });
            } catch (e2) {}
        }

        var oldSeats = domain.parseJSON(oldGame.get("seats"), []);
        var callingSeatIndex = -1;
        for (var i = 0; i < 4; i++) {
            if (oldSeats[i] && oldSeats[i].user_id === auth.id) {
                callingSeatIndex = i;
                break;
            }
        }

        if (callingSeatIndex === -1) {
            return c.forbiddenError("You were not a player in the original game");
        }

        // Retain seats and fill bots if needed
        var newSeats = [];
        var botNames = ["Bot Alpha", "Bot Bravo", "Bot Charlie", "Bot Delta"];
        for (var j = 0; j < 4; j++) {
            var sInfo = oldSeats[j];
            if (sInfo && sInfo.user_id) {
                newSeats.push({
                    user_id: sInfo.user_id,
                    name: sInfo.name,
                    is_bot: false,
                    connected: true
                });
            } else {
                newSeats.push({
                    user_id: null,
                    name: sInfo ? sInfo.name : (botNames[j] || ("Bot " + (j + 1))),
                    is_bot: true,
                    connected: true
                });
            }
        }

        var gamesColl = $app.findCollectionByNameOrId("games");
        var newGame = new Record(gamesColl, {
            status: "waiting",
            room_code: oldGame.getString("room_code") || domain.RoomCode.generate().value,
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

        // Link rematch_game_id to old game
        oldGame.set("rematch_game_id", newGame.id);
        $app.save(oldGame);

        // Deal cards and start playing
        gameService.dealAndStartGame(newGame);

        return c.json(200, {
            game: newGame,
            seat_index: callingSeatIndex
        });
    } catch (err) {
        console.error("REMATCH_ERR:", err);
        return c.badRequestError(err.message || String(err));
    }
}, $apis.requireAuth());

// ----------------------------------------------------
// AUTHORITATIVE MOVE HOOK (onRecordCreateRequest('moves'))
// ----------------------------------------------------

onRecordCreateRequest((e) => {
    try {
        var domain = require(__hooks + "/domain.js");
        var gameService = require(__hooks + "/game_service.js");
        var moveRecord = e.record;
        var gameId = moveRecord.getString("game_id");
        var action = moveRecord.getString("action");
        var seatIndex = moveRecord.getInt("seat_index");
        var cardsPlayed = domain.parseJSON(moveRecord.get("cards"), []);

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
        var passedSeats = domain.parseJSON(game.get("passed_seats"), []);
        var counts = domain.parseJSON(game.get("counts"), [13, 13, 13, 13]);
        var lastCombo = domain.parseJSON(game.get("last_combo"), null);
        var winnerRanks = domain.parseJSON(game.get("winner_ranks"), []);
        var seats = domain.parseJSON(game.get("seats"), []);
        var currentSeat = seats[currentTurn];
        var turnStartedAt = game.getString("turn_started_at");

        if (lastCombo && (!lastCombo.cards || lastCombo.cards.length === 0)) {
            lastCombo = null;
        }

        var isOpeningMove = (lastCombo == null && counts[0] === 13 && counts[1] === 13 && counts[2] === 13 && counts[3] === 13);

        // 1. Handle TICK Action (Bot move or turn timer timeout auto-play)
        if (action === "tick") {
            var isBotTurn = currentSeat && currentSeat.is_bot === true;
            var timer = new domain.TurnTimer(turnStartedAt);
            var isTimeout = !isBotTurn && timer.isExpired();

            if (!isBotTurn && !isTimeout) {
                throw new BadRequestError("Not a bot turn and human player has not timed out");
            }

            // Fetch hand of current turn player
            var currentHandRecord = null;
            try {
                var botHands = $app.findRecordsByFilter("hands", "game_id = {:gameId}", "", 10, 0, { gameId: gameId });
                for (var hb = 0; hb < botHands.length; hb++) {
                    if (botHands[hb].getInt("seat_index") === currentTurn) {
                        currentHandRecord = botHands[hb];
                        break;
                    }
                }
            } catch (hErr) {}

            if (!currentHandRecord) {
                throw new BadRequestError("Hand not found for seat " + currentTurn);
            }

            var botHandCards = domain.parseJSON(currentHandRecord.get("cards"), []);
            var botMove = domain.BotEngine.decideMove({
                hand: new domain.Hand(botHandCards),
                trick: lastCombo && lastCombo.cards?.length > 0
                    ? new domain.Trick({ lastCombo: domain.CardCombo.evaluate(lastCombo.cards) })
                    : domain.Trick.createFresh(currentTurn),
                isOpeningMove: isOpeningMove,
                counts: counts
            });

            action = botMove.action;
            seatIndex = currentTurn;
            moveRecord.set("seat_index", currentTurn);
            moveRecord.set("action", action);

            if (action === "play") {
                cardsPlayed = botMove.cards.map(function(c) { return c.code; });
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
                var humanHands = $app.findRecordsByFilter("hands", "game_id = {:gameId}", "", 10, 0, { gameId: gameId });
                for (var hh = 0; hh < humanHands.length; hh++) {
                    if (humanHands[hh].getInt("seat_index") === seatIndex) {
                        playerHandRecord = humanHands[hh];
                        break;
                    }
                }
            } catch (hErr2) {}

            if (!playerHandRecord) {
                throw new BadRequestError("Hand record not found");
            }

            playerHandCards = domain.parseJSON(playerHandRecord.get("cards"), []);

            // Verify player actually holds the played cards
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
            if (isOpeningMove && cardsPlayed.indexOf(domain.CARD_3D) === -1) {
                throw new BadRequestError("Opening move must include 3 of Diamonds (3♦)");
            }

            // Evaluate combo using Domain
            playedCombo = domain.CardCombo.evaluate(cardsPlayed);
            if (!playedCombo) {
                throw new BadRequestError("Invalid card combination");
            }

            // Check if beats last_combo
            if (lastCombo && lastCombo.cards && lastCombo.cards.length > 0) {
                var targetCombo = domain.CardCombo.evaluate(lastCombo.cards);
                if (targetCombo && !playedCombo.canBeat(targetCombo)) {
                    throw new BadRequestError("Played combination does not beat the current pile");
                }
            }

            // Set combo fields on move record
            moveRecord.set("combo_type", playedCombo.type);
            moveRecord.set("combo_power", playedCombo.power);
            moveRecord.set("cards", domain.Card.sortCodes(cardsPlayed));
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
            playerHandRecord.set("cards", domain.Card.sortCodes(remainingCards));
            $app.save(playerHandRecord);

            // 2. Update counts and last_combo
            counts[seatIndex] = remainingCards.length;
            game.set("counts", counts);
            game.set("last_combo", {
                type: playedCombo.type,
                power: playedCombo.power,
                cards: domain.Card.sortCodes(cardsPlayed),
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

            // If game is still active, advance turn using Trick domain entity
            if (game.getString("status") === "playing") {
                var domainTrick = new domain.Trick({
                    lastCombo: playedCombo,
                    leaderSeatIndex: leaderIndex,
                    passedSeats: passedSeats,
                    trickWinnerSeat: seatIndex
                });

                var nextTurn = domainTrick.findNextSeat(counts, seatIndex);
                if (nextTurn === -1) {
                    // All other active players have already passed in this trick: trick ends immediately!
                    game.set("last_combo", null);
                    game.set("passed_seats", []);
                    game.set("pass_count", 0);
                    if (counts[seatIndex] > 0) {
                        game.set("turn_index", seatIndex);
                        game.set("leader_index", seatIndex);
                    } else {
                        var clockwiseLeader = gameService.findNextActiveSeat(counts, seatIndex);
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
            var domainTrick2 = new domain.Trick({
                lastCombo: lastCombo ? domain.CardCombo.evaluate(lastCombo.cards) : null,
                leaderSeatIndex: leaderIndex,
                passedSeats: passedSeats,
                trickWinnerSeat: trickWinnerSeat
            });

            var nextActiveTurn = domainTrick2.findNextSeat(counts, seatIndex);

            // If no other eligible player remains, trick ends!
            if (nextActiveTurn === -1) {
                game.set("last_combo", null);
                game.set("passed_seats", []);
                game.set("pass_count", 0);

                if (counts[trickWinnerSeat] > 0) {
                    game.set("turn_index", trickWinnerSeat);
                    game.set("leader_index", trickWinnerSeat);
                } else {
                    var clockwiseLeader2 = gameService.findNextActiveSeat(counts, trickWinnerSeat);
                    game.set("turn_index", clockwiseLeader2);
                    game.set("leader_index", clockwiseLeader2);
                }
            } else {
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
