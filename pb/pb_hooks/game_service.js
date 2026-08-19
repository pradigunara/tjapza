var domain = require(__hooks + "/domain.js");

function findHandRecord(gameId, seatIndex, userId) {
    if (!gameId) return null;
    var hand = null;

    // 1. Primary lookup: by game_id and seat_index
    if (typeof seatIndex === "number" && seatIndex >= 0 && seatIndex <= 3) {
        try {
            hand = $app.findFirstRecordByFilter("hands", "game_id = '" + gameId + "' && seat_index = " + seatIndex);
        } catch (_) {}
    }

    // 2. Secondary lookup: by game_id and user_id (if userId is non-empty)
    if (!hand && userId) {
        try {
            hand = $app.findFirstRecordByFilter("hands", "game_id = '" + gameId + "' && user_id = '" + userId + "'");
        } catch (_) {}
    }

    // 3. Fallback: scan all hands for game_id and match seat or user_id
    if (!hand) {
        try {
            var records = $app.findRecordsByFilter("hands", "game_id = '" + gameId + "'", "-created", 10, 0);
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

function dealAndStartGame(gameRecord) {
    // 1. Purge any stale hand records for this game if re-dealt or retried
    try {
        var existingHands = $app.findRecordsByFilter("hands", "game_id = '" + gameRecord.id + "'", "-created", 50, 0);
        for (var eh = 0; eh < existingHands.length; eh++) {
            try { $app.delete(existingHands[eh]); } catch (_) {}
        }
    } catch (_) {}

    var rawSeats = domain.parseJSON(gameRecord.get("seats"), []);
    var deal = domain.Deck.createStandard().shuffle().deal(4);
    var handsColl = $app.findCollectionByNameOrId("hands");

    for (var seatIdx = 0; seatIdx < 4; seatIdx++) {
        var seatInfo = rawSeats[seatIdx];
        var handRecord = new Record(handsColl, {
            game_id: gameRecord.id,
            user_id: (seatInfo && seatInfo.user_id) ? seatInfo.user_id : null,
            seat_index: seatIdx,
            cards: deal.hands[seatIdx].map(function(c) { return c.code; })
        });
        $app.save(handRecord);
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
    $app.save(gameRecord);
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
};
