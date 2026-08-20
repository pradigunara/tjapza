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

        var resultGame = null;
        var resultSeat = -1;

        // Transactional seat claim: fresh read + re-check inside the tx so
        // concurrent joins cannot overwrite each other's seat write.
        $app.runInTransaction(function (txApp) {
            var game = null;
            if (gameId) {
                try {
                    game = txApp.findRecordById("games", gameId);
                } catch (e) {}
            } else if (roomCode) {
                try {
                    game = txApp.findFirstRecordByFilter("games", "room_code = '" + roomCode.toUpperCase() + "' && status = 'waiting'");
                } catch (e) {}
            }

            if (!game) {
                throw new NotFoundError("Room not found or no longer waiting for players");
            }

            var seats = domain.parseJSON(game.get("seats"), []);
            var displayName = auth.get("display_name") || auth.get("name") || auth.get("email") || "Player";

            // Check if user is already seated (e.g. page reload, reconnect, rematch)
            for (var i = 0; i < 4; i++) {
                if (seats[i] && seats[i].user_id === auth.id) {
                    resultGame = game;
                    resultSeat = i;
                    return;
                }
            }

            if (game.getString("status") !== "waiting") {
                throw new BadRequestError("Game is already in progress or finished");
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
                throw new BadRequestError("Room is already full");
            }

            seats[targetSeat] = {
                user_id: auth.id,
                name: displayName,
                is_bot: false,
                connected: true
            };

            game.set("seats", seats);
            txApp.save(game);

            resultGame = game;
            resultSeat = targetSeat;
        });

        return c.json(200, {
            game: resultGame,
            seat_index: resultSeat
        });
    } catch (err) {
        if (err instanceof NotFoundError || err instanceof BadRequestError || err instanceof ForbiddenError) {
            throw err;
        }
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

        var resultGame = null;

        // Transactional start: fresh read + status re-check inside the tx so
        // concurrent starts cannot double-deal and concurrent joins cannot
        // interleave with the bot fill.
        $app.runInTransaction(function (txApp) {
            var game = null;
            try {
                game = txApp.findRecordById("games", gameId);
            } catch (e) {
                throw new NotFoundError("Game not found");
            }

            // Idempotency: if already playing, return current game state
            if (game.getString("status") === "playing") {
                resultGame = game;
                return;
            }

            if (game.getString("status") !== "waiting") {
                throw new BadRequestError("Game is not in a startable state");
            }

            var seats = domain.parseJSON(game.get("seats"), []);
            var domainRoom = new domain.Room({
                id: game.id,
                code: game.getString("room_code"),
                status: "waiting",
                seats: seats
            });

            var hostIndex = domainRoom.hostSeatIndex;
            var isPublicRoom = game.getBool("is_public");

            // Public rooms: any seated human may force-start (matches the
            // client's 30s "Start with Bots Now" button). Private rooms:
            // host only.
            if (isPublicRoom) {
                var callerSeated = false;
                for (var ps = 0; ps < 4; ps++) {
                    if (seats[ps] && seats[ps].user_id === auth.id) {
                        callerSeated = true;
                        break;
                    }
                }
                if (!callerSeated) {
                    throw new ForbiddenError("Only seated players can start this public room");
                }
            } else if (hostIndex === -1 || !seats[hostIndex] || seats[hostIndex].user_id !== auth.id) {
                throw new ForbiddenError("Only the room host can start the game");
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
            txApp.save(game);

            // Deal cards and transition to playing state (guards on waiting)
            gameService.dealAndStartGame(game, txApp);

            var domainGame = gameService.recordToDomain(game);
            var rec = domain.CapsaGame.reconcile(domainGame);
            if (rec.healed) {
                gameService.applyDomainToRecord(rec.game, game);
                txApp.save(game);
            }

            resultGame = game;
        });

        return c.json(200, {
            game: resultGame
        });
    } catch (err) {
        if (err instanceof NotFoundError || err instanceof BadRequestError || err instanceof ForbiddenError) {
            throw err;
        }
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

            var claimedSeat = -1;
            var alreadySeated = -1;
            var skipCandidate = false;

            // Transactional seat claim on a fresh read: concurrent quickplay
            // users cannot claim the same seat or interleave with a start.
            $app.runInTransaction(function (txApp) {
                var game = null;
                try {
                    game = txApp.findRecordById("games", g.id);
                } catch (e) {
                    skipCandidate = true; // vanished concurrently
                    return;
                }
                g = game;

                if (game.getString("status") !== "waiting") {
                    skipCandidate = true; // started concurrently
                    return;
                }

                var seats = domain.parseJSON(game.get("seats"), []);

                // Check if user is already in this game
                for (var s = 0; s < 4; s++) {
                    if (seats[s] && seats[s].user_id === auth.id) {
                        alreadySeated = s;
                        return;
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
                        game.set("seats", seats);
                        txApp.save(game);

                        // If room is now full (4 humans), start immediately
                        var humanCount = 0;
                        for (var h = 0; h < 4; h++) {
                            if (seats[h] && seats[h].user_id && !seats[h].is_bot) {
                                humanCount++;
                            }
                        }

                        if (humanCount === 4) {
                            gameService.dealAndStartGame(game, txApp);
                        }

                        claimedSeat = s2;
                        return;
                    }
                }

                skipCandidate = true; // filled concurrently
            });

            if (alreadySeated !== -1) {
                return c.json(200, {
                    game: g,
                    seat_index: alreadySeated
                });
            }
            if (claimedSeat !== -1) {
                return c.json(200, {
                    game: g,
                    seat_index: claimedSeat
                });
            }
            // skipCandidate: try the next open game
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

        var domainGame = gameService.recordToDomain(newGame);
        var rec = domain.CapsaGame.reconcile(domainGame);
        if (rec.healed) {
            gameService.applyDomainToRecord(rec.game, newGame);
            $app.save(newGame);
        }

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
        var originalAction = moveRecord.getString("action");
        var action = originalAction;
        var seatIndex = moveRecord.getInt("seat_index");
        var cardsPlayed = domain.parseJSON(moveRecord.get("cards"), []);
        var isAutomatedMove = (originalAction === "tick");

        if (action !== "play" && action !== "pass" && action !== "tick") {
            throw new BadRequestError("Invalid action type: " + action);
        }

        var isNoOpTick = false;

        $app.runInTransaction((txApp) => {
            var game = null;
            try {
                game = txApp.findRecordById("games", gameId);
            } catch (err) {
                throw new BadRequestError("Game not found");
            }

            if (game.getString("status") !== "playing") {
                if (action === "tick") {
                    isNoOpTick = true;
                    return;
                }
                throw new BadRequestError("Game is not in playing state");
            }

            // 1. PRE-RECONCILIATION
            var domainGame = gameService.recordToDomain(game);
            var preRec = domain.CapsaGame.reconcile(domainGame);
            if (preRec.healed) {
                gameService.applyDomainToRecord(preRec.game, game);
                txApp.save(game);
                domainGame = preRec.game;
            }

            if (game.getString("status") !== "playing") {
                if (action === "tick") {
                    isNoOpTick = true;
                    return;
                }
                throw new BadRequestError("Game is not in playing state");
            }

            var currentTurn = domainGame.turnIndex;

            // If action is tick, automatically sync seatIndex with the authoritative server turn
            if (action === "tick") {
                seatIndex = currentTurn;
                moveRecord.set("seat_index", currentTurn);
            }

            if (typeof seatIndex !== "number" || seatIndex < 0 || seatIndex > 3) {
                throw new BadRequestError("Invalid seat_index: " + seatIndex);
            }

            var counts = domainGame.counts;
            var lastCombo = domainGame.trick.lastCombo;
            var seats = domain.parseJSON(game.get("seats"), []);
            var currentSeat = seats[currentTurn];
            var turnStartedAt = game.getString("turn_started_at");
            var isOpeningMove = domainGame.isOpeningMove;
            var currentHandRecord = null;

            // 2. Handle TICK Action (Bot move or turn timer timeout auto-play)
            if (action === "tick") {
                var isBotTurn = currentSeat && currentSeat.is_bot === true;
                var timer = new domain.TurnTimer(turnStartedAt);
                var isTimeout = !isBotTurn && timer.isExpired();

                if (!isBotTurn && !isTimeout) {
                    // Strictly idempotent no-op: return cleanly without error
                    isNoOpTick = true;
                    return;
                }

                // Fetch hand of current turn player using robust service helper
                currentHandRecord = gameService.findHandRecord(gameId, currentTurn, currentSeat ? currentSeat.user_id : null, txApp);

                if (!currentHandRecord) {
                    // If hand is missing, check if player or game has finished
                    var nextActive = gameService.findNextActiveSeat(counts, currentTurn);
                    if (nextActive !== currentTurn && counts[currentTurn] === 0) {
                        game.set("turn_index", nextActive);
                        if (domainGame.trick.isFresh) {
                            game.set("leader_index", nextActive);
                        }
                        game.set("turn_started_at", new Date().toISOString());
                        txApp.save(game);
                        return;
                    }
                    console.error("[TICK_HAND_NOT_FOUND] gameId: " + gameId + " currentTurn: " + currentTurn);
                    throw new BadRequestError("Hand not found for seat " + currentTurn);
                }

                var botHandCards = domain.parseJSON(currentHandRecord.get("cards"), []);
                var botMove = domain.BotEngine.decideMove({
                    hand: new domain.Hand(botHandCards),
                    trick: domainGame.trick,
                    isOpeningMove: isOpeningMove,
                    counts: counts,
                    seatIndex: currentTurn
                });

                action = botMove.action;
                seatIndex = currentTurn;

                // Prevent bot from ever attempting to pass when leading or opening
                if (action === "pass" && (!lastCombo || isOpeningMove)) {
                    if (botHandCards.length > 0) {
                        action = "play";
                        var forcedCard = isOpeningMove && botHandCards.indexOf(domain.CARD_3D) !== -1
                            ? domain.CARD_3D
                            : botHandCards[0];
                        cardsPlayed = [forcedCard];
                    }
                }

                moveRecord.set("seat_index", currentTurn);
                moveRecord.set("action", action);

                if (action === "play") {
                    if (!cardsPlayed || cardsPlayed.length === 0) {
                        cardsPlayed = botMove.cards.map(function(c) { return typeof c === 'number' ? c : c.code; });
                    }
                    moveRecord.set("cards", cardsPlayed);
                } else {
                    cardsPlayed = [];
                    moveRecord.set("cards", []);
                }
            }

            // 3. Handle PLAY Action
            var playedCombo = null;
            var playerHandRecord = null;
            var playerHandCards = [];

            if (action === "play") {
                // Validation: verify turn
                if (seatIndex !== currentTurn) {
                    throw new BadRequestError("Not your turn to play");
                }

                // If direct human action (not an automated tick), verify authentication matches seat
                if (!isAutomatedMove && e.auth && currentSeat && !currentSeat.is_bot) {
                    if (currentSeat.user_id !== e.auth.id) {
                        throw new ForbiddenError("You are not authorized to play for this seat");
                    }
                }

                // Fetch player hand
                if (isAutomatedMove && currentHandRecord) {
                    playerHandRecord = currentHandRecord;
                } else {
                    playerHandRecord = gameService.findHandRecord(gameId, seatIndex, currentSeat ? currentSeat.user_id : (e.auth ? e.auth.id : null), txApp);
                }

                if (!playerHandRecord) {
                    console.error("[HAND_NOT_FOUND_DEBUG] gameId: " + gameId + " seatIndex: " + seatIndex + " currentTurn: " + currentTurn + " auth: " + (e.auth ? e.auth.id : "none"));
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

                if (lastCombo && !playedCombo.canBeat(lastCombo)) {
                    throw new BadRequestError("Played combination does not beat the current pile");
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
                if (!isAutomatedMove && e.auth && currentSeat && !currentSeat.is_bot) {
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

            // 4. Domain transition, then persist side effects (hand, results)
            var prevRanks = (domainGame.winnerRanks || []).slice();

            try {
                if (action === "play") {
                    var remainingCards = playerHandCards.filter(function(card) {
                        return cardsPlayed.indexOf(card) === -1;
                    });
                    playerHandRecord.set("cards", domain.Card.sortCodes(remainingCards));
                    txApp.save(playerHandRecord);
                    domainGame = domainGame.applyPlay(cardsPlayed, seatIndex);
                } else {
                    domainGame = domainGame.applyPass(seatIndex);
                }
            } catch (applyErr) {
                throw new BadRequestError(applyErr && applyErr.message ? applyErr.message : String(applyErr));
            }

            gameService.persistNewResults(txApp, game.id, prevRanks, domainGame.winnerRanks, seats);
            gameService.applyDomainToRecord(domainGame, game);
            if (domainGame.status === "playing") {
                game.set("turn_started_at", new Date().toISOString());
            }

            var postRec = domain.CapsaGame.reconcile(domainGame);
            if (postRec.healed) {
                gameService.applyDomainToRecord(postRec.game, game);
            }

            txApp.save(game);
        });

        if (isNoOpTick) {
            // Idempotent no-op: success WITHOUT persistence. Heartbeat polls
            // would otherwise write ~1-2 inert tick rows per second per game.
            // Not calling e.next() cancels the record create.
            return;
        }

        return e.next();
    } catch (err) {
        if (!(err instanceof BadRequestError) && !(err instanceof ForbiddenError) && !(err instanceof NotFoundError)) {
            console.error("MOVE_HOOK_SYSTEM_ERROR:", err);
        }
        throw err;
    }
}, "moves");

// ----------------------------------------------------
// CRON: EPHEMERAL DATA CLEANUP
// ----------------------------------------------------
cronAdd("tjapzaEphemeralCleanup", "*/10 * * * *", () => {
    try {
        var gameService = require(__hooks + "/game_service.js");
        gameService.purgeEphemeralData($app);
    } catch (cronErr) {
        console.error("CRON_CLEANUP_ERROR:", cronErr);
    }
});
