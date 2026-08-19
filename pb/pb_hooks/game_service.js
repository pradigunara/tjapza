var domain = require(__hooks + "/domain.js");

function findHandRecord(gameId, seatIndex, userId, app) {
    var db = app || $app;
    if (!gameId) return null;
    var hand = null;

    // 1. Primary lookup: by game_id and seat_index
    if (typeof seatIndex === "number" && seatIndex >= 0 && seatIndex <= 3) {
        try {
            hand = db.findFirstRecordByFilter("hands", "game_id = '" + gameId + "' && seat_index = " + seatIndex);
        } catch (_) {}
    }

    // 2. Secondary lookup: by game_id and user_id (if userId is non-empty)
    if (!hand && userId) {
        try {
            hand = db.findFirstRecordByFilter("hands", "game_id = '" + gameId + "' && user_id = '" + userId + "'");
        } catch (_) {}
    }

    // 3. Fallback: scan all hands for game_id and match seat or user_id
    if (!hand) {
        try {
            var records = db.findRecordsByFilter("hands", "game_id = '" + gameId + "'", "-created", 10, 0);
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

    return hand;
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
    var rawLastCombo = domain.parseJSON(gameRecord.get ? gameRecord.get("last_combo") : gameRecord.last_combo, null);

    var lastCombo = null;
    var lastPlaySeatIndex = leaderIndex;
    if (rawLastCombo && rawLastCombo.cards && rawLastCombo.cards.length > 0) {
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

    if (domainGame.trick && domainGame.trick.lastCombo && domainGame.trick.lastCombo.cards && domainGame.trick.lastCombo.cards.length > 0) {
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
    // 1. Purge any stale hand records for this game if re-dealt or retried
    try {
        var existingHands = db.findRecordsByFilter("hands", "game_id = '" + gameRecord.id + "'", "-created", 50, 0);
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
            game_id: gameRecord.id,
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
    for (var i = 1; i <= 3; i++) {
        var s = (startSeat + i) % 4;
        if (counts && counts[s] > 0) {
            return s;
        }
    }
    return startSeat;
}

module.exports = {
    dealAndStartGame: dealAndStartGame,
    findNextActiveSeat: findNextActiveSeat,
    findHandRecord: findHandRecord,
    recordToDomain: recordToDomain,
    applyDomainToRecord: applyDomainToRecord,
};
