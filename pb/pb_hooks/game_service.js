var domain = require(__hooks + "/domain.js");

function findHandRecord(gameId, seatIndex, userId, app) {
    var db = app || $app;
    if (!gameId) return null;
    var hand = null;

    // Strategy 1: Exact game_id and seat_index filter
    if (typeof seatIndex === "number" && seatIndex >= 0 && seatIndex <= 3) {
        try {
            hand = db.findFirstRecordByFilter("hands", "game_id = '" + gameId + "' && seat_index = " + seatIndex);
        } catch (_) {}
    }

    // Strategy 2: Exact game_id and user_id filter
    if (!hand && userId) {
        try {
            hand = db.findFirstRecordByFilter("hands", "game_id = '" + gameId + "' && user_id = '" + userId + "'");
        } catch (_) {}
    }

    // Strategy 3: Relation traversal filter
    if (!hand && typeof seatIndex === "number") {
        try {
            hand = db.findFirstRecordByFilter("hands", "game_id.id = '" + gameId + "' && seat_index = " + seatIndex);
        } catch (_) {}
    }

    // Strategy 4: Full array scan for game_id (up to 50 records)
    if (!hand) {
        try {
            var records = db.findRecordsByFilter("hands", "game_id = '" + gameId + "'", "-created", 50, 0);
            for (var i = 0; i < records.length; i++) {
                var r = records[i];
                if (typeof seatIndex === "number" && r.getInt("seat_index") === seatIndex) {
                    hand = r;
                    break;
                }
                if (userId && r.getString("user_id") === userId) {
                    hand = r;
                    break;
                }
            }
        } catch (_) {}
    }

    // Strategy 5: App fallback if db was txApp and failed
    if (!hand && app && app !== $app) {
        return findHandRecord(gameId, seatIndex, userId, $app);
    }

    // Strategy 6: Scan all recent hands across the database matching user_id
    if (!hand && userId) {
        try {
            var userHands = $app.findRecordsByFilter("hands", "user_id = '" + userId + "'", "-created", 20, 0);
            for (var u = 0; u < userHands.length; u++) {
                var uh = userHands[u];
                if (uh.getString("game_id") === gameId) {
                    hand = uh;
                    break;
                }
            }
        } catch (_) {}
    }

    return hand;
}

function effectiveLastCombo(raw) {
    if (raw && raw.cards && raw.cards.length > 0) return raw;
    return null;
}

function recordToDomain(gameRecord) {
    if (!gameRecord) return null;
    var rawSeats = domain.parseJSON(gameRecord.get ? gameRecord.get("seats") : gameRecord.seats, []);
    var seats = rawSeats.map(function(s) {
        return {
            userId: s ? (s.user_id || s.userId || null) : null,
            name: s ? (s.name || "") : "",
            isBot: Boolean(s && (s.is_bot || s.isBot)),
            connected: Boolean(s && s.connected)
        };
    });

    var counts = domain.parseJSON(gameRecord.get ? gameRecord.get("counts") : gameRecord.counts, [13, 13, 13, 13]);
    var winnerRanks = domain.parseJSON(gameRecord.get ? gameRecord.get("winner_ranks") : gameRecord.winner_ranks, []);
    var passedSeats = domain.parseJSON(gameRecord.get ? gameRecord.get("passed_seats") : gameRecord.passed_seats, []);
    var passCount = gameRecord.getInt ? gameRecord.getInt("pass_count") : (gameRecord.pass_count || 0);
    var leaderIndex = gameRecord.getInt ? gameRecord.getInt("leader_index") : (gameRecord.leader_index || 0);
    var turnIndex = gameRecord.getInt ? gameRecord.getInt("turn_index") : (gameRecord.turn_index || 0);
    var rawLastCombo = effectiveLastCombo(domain.parseJSON(gameRecord.get ? gameRecord.get("last_combo") : gameRecord.last_combo, null));

    var lastCombo = null;
    var lastPlaySeatIndex = leaderIndex;
    if (rawLastCombo) {
        lastCombo = domain.CardCombo.evaluate(rawLastCombo.cards);
        if (typeof rawLastCombo.seat_index === "number") {
            lastPlaySeatIndex = rawLastCombo.seat_index;
        }
    }

    var trick = new domain.Trick({
        lastCombo: lastCombo,
        leaderSeatIndex: leaderIndex,
        passedSeats: passedSeats,
        passCount: passCount,
        lastPlaySeatIndex: lastPlaySeatIndex
    });

    var status = gameRecord.getString ? gameRecord.getString("status") : (gameRecord.status || "waiting");
    var roomCode = gameRecord.getString ? gameRecord.getString("room_code") : (gameRecord.room_code || "");
    var isPublic = gameRecord.getBool ? gameRecord.getBool("is_public") : Boolean(gameRecord.is_public);

    return new domain.CapsaGame({
        id: gameRecord.id || "",
        status: status,
        seats: seats,
        counts: counts,
        turnIndex: turnIndex,
        leaderIndex: leaderIndex,
        trick: trick,
        winnerRanks: winnerRanks,
        roomCode: roomCode,
        isPublic: isPublic
    });
}

function applyDomainToRecord(domainGame, gameRecord) {
    if (!domainGame || !gameRecord) return;

    gameRecord.set("status", domainGame.status);
    gameRecord.set("counts", domainGame.counts);
    gameRecord.set("turn_index", domainGame.turnIndex);
    gameRecord.set("leader_index", domainGame.leaderIndex);
    gameRecord.set("winner_ranks", domainGame.winnerRanks);

    if (domainGame.trick && effectiveLastCombo(domainGame.trick.lastCombo)) {
        var cardCodes = domainGame.trick.lastCombo.cards.map(function(c) {
            return typeof c === 'number' ? c : c.code;
        });
        gameRecord.set("last_combo", {
            type: domainGame.trick.lastCombo.type,
            power: domainGame.trick.lastCombo.power,
            cards: domain.Card.sortCodes(cardCodes),
            seat_index: domainGame.trick.lastPlaySeatIndex
        });
        gameRecord.set("pass_count", domainGame.trick.passCount);
        gameRecord.set("passed_seats", domainGame.trick.passedSeats);
    } else {
        gameRecord.set("last_combo", null);
        gameRecord.set("pass_count", 0);
        gameRecord.set("passed_seats", []);
    }
}

function dealAndStartGame(gameRecord, app) {
    var db = app || $app;
    var gId = (gameRecord && gameRecord.id) ? gameRecord.id : (gameRecord.getString ? gameRecord.getString("id") : "");

    // Re-entrancy guard: only ever deal a game that is still waiting. Callers
    // run inside a transaction; a concurrent start that already flipped the
    // status must not trigger a second deal (hands would be purged/redealt).
    if (gameRecord && gameRecord.getString && gameRecord.getString("status") !== "waiting") {
        return;
    }

    // 1. Purge any stale hand records for this game if re-dealt or retried
    try {
        var existingHands = db.findRecordsByFilter("hands", "game_id = '" + gId + "'", "-created", 50, 0);
        for (var eh = 0; eh < existingHands.length; eh++) {
            try { db.delete(existingHands[eh]); } catch (_) {}
        }
    } catch (_) {}

    var rawSeats = domain.parseJSON(gameRecord.get("seats"), []);
    var deal = domain.Deck.createStandard().shuffle().deal(4);
    var handsColl = db.findCollectionByNameOrId("hands");

    for (var seatIdx = 0; seatIdx < 4; seatIdx++) {
        var seatInfo = rawSeats[seatIdx];
        var handRecord = new Record(handsColl, {
            game_id: gId,
            user_id: (seatInfo && seatInfo.user_id) ? seatInfo.user_id : null,
            seat_index: seatIdx,
            cards: deal.hands[seatIdx].map(function(c) { return c.code; })
        });
        db.save(handRecord);
    }

    gameRecord.set("status", "playing");
    gameRecord.set("counts", [13, 13, 13, 13]);
    gameRecord.set("turn_index", deal.startingSeat);
    gameRecord.set("leader_index", deal.startingSeat);
    gameRecord.set("last_combo", null);
    gameRecord.set("pass_count", 0);
    gameRecord.set("passed_seats", []);
    gameRecord.set("winner_ranks", []);
    gameRecord.set("turn_started_at", new Date().toISOString());

    var dGame = recordToDomain(gameRecord);
    var rec = domain.CapsaGame.reconcile(dGame);
    if (rec.healed) {
        applyDomainToRecord(rec.game, gameRecord);
    }

    db.save(gameRecord);
}

function findNextActiveSeat(counts, startSeat) {
    return domain.CapsaGame.findNextActiveSeat(counts || [], startSeat);
}

function clearTrickAndLead(game, winnerSeat, counts) {
    game.set("last_combo", null);
    game.set("passed_seats", []);
    game.set("pass_count", 0);
    var lead = (counts && counts[winnerSeat] > 0)
        ? winnerSeat
        : findNextActiveSeat(counts, winnerSeat);
    game.set("turn_index", lead);
    game.set("leader_index", lead);
}

/**
 * Ephemeral data cleanup, invoked by the 10-minute tjapzaEphemeralCleanup
 * cron in main.pb.js.
 *
 * Hands are purged ONLY when their related game is confirmed non-playing
 * (waiting/finished) or confirmed absent. A game-record lookup that fails
 * with anything other than NotFoundError is treated as transient: the hand
 * is kept and retried on the next run. Deleting hands of an active game
 * bricks both human plays and bot ticks (hand-not-found 400 loops).
 */
function purgeEphemeralData(app) {
    var db = app || $app;

    // 1. Purge ephemeral moves older than 15 minutes
    // (batch 1000: no-op tick suppression keeps generation low, but the
    //  purge must never lag behind move creation in long games)
    var movesCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    var oldMoves = db.findRecordsByFilter("moves", "created < '" + movesCutoff + "'", "-created", 1000, 0);
    for (var m = 0; m < oldMoves.length; m++) {
        try { db.delete(oldMoves[m]); } catch (_) {}
    }

    // 2. Purge ephemeral hands older than 30 minutes — never for playing games
    var handsCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    var oldHands = db.findRecordsByFilter("hands", "created < '" + handsCutoff + "'", "-created", 100, 0);
    for (var h = 0; h < oldHands.length; h++) {
        var hand = oldHands[h];

        var handGameId = "";
        try { handGameId = hand.getString("game_id") || ""; } catch (_) {}

        // Map the game lookup onto the shared purge-policy contract
        // (domain.shouldPurgeHand). resolved:false (transient lookup failure)
        // keeps the hand; it is retried on the next cron run.
        var resolution;
        if (!handGameId) {
            // Dangling relation (game record already deleted)
            resolution = { resolved: true, status: null };
        } else {
            try {
                var handGame = db.findRecordById("games", handGameId);
                resolution = { resolved: true, status: handGame.getString("status") };
            } catch (err) {
                if (typeof NotFoundError !== "undefined" && err instanceof NotFoundError) {
                    // Game record confirmed deleted — orphaned hand is purgeable
                    resolution = { resolved: true, status: null };
                } else {
                    resolution = { resolved: false };
                }
            }
        }

        if (!domain.shouldPurgeHand(resolution)) continue;

        try { db.delete(hand); } catch (_) {}
    }

    // 3. Purge abandoned waiting games older than 30 minutes
    var waitingCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    var abandonedGames = db.findRecordsByFilter("games", "status = 'waiting' && created < '" + waitingCutoff + "'", "-created", 50, 0);
    for (var ag = 0; ag < abandonedGames.length; ag++) {
        try { db.delete(abandonedGames[ag]); } catch (_) {}
    }

    // 4. Purge finished games older than 2 hours (results records are preserved for lifetime player statistics)
    var finishedCutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    var oldFinishedGames = db.findRecordsByFilter("games", "status = 'finished' && updated < '" + finishedCutoff + "'", "-created", 50, 0);
    for (var fg = 0; fg < oldFinishedGames.length; fg++) {
        try { db.delete(oldFinishedGames[fg]); } catch (_) {}
    }
}


module.exports = {
    dealAndStartGame: dealAndStartGame,
    findNextActiveSeat: findNextActiveSeat,
    clearTrickAndLead: clearTrickAndLead,
    findHandRecord: findHandRecord,
    effectiveLastCombo: effectiveLastCombo,
    recordToDomain: recordToDomain,
    applyDomainToRecord: applyDomainToRecord,
    purgeEphemeralData: purgeEphemeralData,
};
