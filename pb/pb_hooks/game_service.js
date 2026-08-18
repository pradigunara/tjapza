var domain = require(__hooks + "/domain.js");

function dealAndStartGame(gameRecord) {
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
};
