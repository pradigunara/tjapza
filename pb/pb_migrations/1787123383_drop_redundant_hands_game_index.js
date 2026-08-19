/// <reference path="../pb_data/types.d.ts" />

// Drop idx_hands_game: fully covered by the leftmost prefix of
// idx_hands_game_seat (game_id, seat_index) for every game_id-only lookup.
// Removes redundant B-tree maintenance on hand inserts (4 per deal).

migrate((app) => {
    const hands = app.findCollectionByNameOrId("hands");
    hands.indexes = hands.indexes.filter(
        (idx) => !/\bidx_hands_game\b/.test(idx) // \b does not match idx_hands_game_seat
    );
    app.save(hands);
}, (app) => {
    const hands = app.findCollectionByNameOrId("hands");
    hands.indexes.push("CREATE INDEX `idx_hands_game` ON `hands` (`game_id`)");
    app.save(hands);
});
