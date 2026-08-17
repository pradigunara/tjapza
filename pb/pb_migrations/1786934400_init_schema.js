/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
    // 1. Update `users` collection to add display_name and view/update rules
    const users = app.findCollectionByNameOrId("users");
    let hasDisplayName = false;
    for (let f of users.fields) {
        if (f.name === "display_name") {
            hasDisplayName = true;
            break;
        }
    }
    if (!hasDisplayName) {
        users.fields.add(new TextField({
            name: "display_name",
            required: false,
        }));
    }
    users.viewRule = "@request.auth.id != ''";
    users.listRule = "@request.auth.id != ''";
    users.updateRule = "@request.auth.id = id";
    app.save(users);

    // 2. Create `games` collection
    const games = new Collection({
        name: "games",
        type: "base",
        viewRule: "@request.auth.id != ''",
        listRule: "@request.auth.id != ''",
        createRule: null,
        updateRule: null,
        deleteRule: null,
        indexes: [
            "CREATE INDEX idx_games_room_code ON games (room_code)",
            "CREATE INDEX idx_games_status ON games (status)"
        ]
    });
    games.fields.add(new TextField({ name: "status", required: true }));
    games.fields.add(new JSONField({ name: "seats", required: true }));
    games.fields.add(new NumberField({ name: "turn_index", required: false }));
    games.fields.add(new NumberField({ name: "leader_index", required: false }));
    games.fields.add(new JSONField({ name: "last_combo", required: false }));
    games.fields.add(new NumberField({ name: "pass_count", required: false }));
    games.fields.add(new JSONField({ name: "counts", required: true }));
    games.fields.add(new TextField({ name: "turn_started_at", required: false }));
    games.fields.add(new JSONField({ name: "winner_ranks", required: false }));
    games.fields.add(new TextField({ name: "room_code", required: true }));
    games.fields.add(new BoolField({ name: "is_public", required: false }));
    games.fields.add(new AutodateField({ name: "created", onCreate: true }));
    games.fields.add(new AutodateField({ name: "updated", onCreate: true, onUpdate: true }));
    app.save(games);

    // 3. Create `hands` collection
    const hands = new Collection({
        name: "hands",
        type: "base",
        viewRule: "user_id = @request.auth.id",
        listRule: "user_id = @request.auth.id",
        createRule: null,
        updateRule: null,
        deleteRule: null,
        indexes: [
            "CREATE INDEX idx_hands_game ON hands (game_id)",
            "CREATE INDEX idx_hands_game_seat ON hands (game_id, seat_index)"
        ]
    });
    hands.fields.add(new RelationField({
        name: "game_id",
        collectionId: games.id,
        cascadeDelete: true,
        maxSelect: 1,
        required: true
    }));
    hands.fields.add(new RelationField({
        name: "user_id",
        collectionId: users.id,
        cascadeDelete: false,
        maxSelect: 1,
        required: false
    }));
    hands.fields.add(new NumberField({ name: "seat_index", required: false }));
    hands.fields.add(new JSONField({ name: "cards", required: false }));
    hands.fields.add(new AutodateField({ name: "created", onCreate: true }));
    hands.fields.add(new AutodateField({ name: "updated", onCreate: true, onUpdate: true }));
    app.save(hands);

    // 4. Create `moves` collection
    const moves = new Collection({
        name: "moves",
        type: "base",
        viewRule: "@request.auth.id != ''",
        listRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: null,
        deleteRule: null,
        indexes: [
            "CREATE INDEX idx_moves_game ON moves (game_id)",
            "CREATE INDEX idx_moves_created ON moves (created)"
        ]
    });
    moves.fields.add(new RelationField({
        name: "game_id",
        collectionId: games.id,
        cascadeDelete: true,
        maxSelect: 1,
        required: true
    }));
    moves.fields.add(new NumberField({ name: "seat_index", required: false }));
    moves.fields.add(new TextField({ name: "action", required: true }));
    moves.fields.add(new JSONField({ name: "cards", required: false }));
    moves.fields.add(new TextField({ name: "combo_type", required: false }));
    moves.fields.add(new NumberField({ name: "combo_power", required: false }));
    moves.fields.add(new AutodateField({ name: "created", onCreate: true }));
    moves.fields.add(new AutodateField({ name: "updated", onCreate: true, onUpdate: true }));
    app.save(moves);

    // 5. Create `results` collection
    const results = new Collection({
        name: "results",
        type: "base",
        viewRule: "@request.auth.id != ''",
        listRule: "@request.auth.id != ''",
        createRule: null,
        updateRule: null,
        deleteRule: null,
        indexes: [
            "CREATE INDEX idx_results_game ON results (game_id)",
            "CREATE INDEX idx_results_user ON results (user_id)"
        ]
    });
    results.fields.add(new RelationField({
        name: "game_id",
        collectionId: games.id,
        cascadeDelete: true,
        maxSelect: 1,
        required: true
    }));
    results.fields.add(new RelationField({
        name: "user_id",
        collectionId: users.id,
        cascadeDelete: false,
        maxSelect: 1,
        required: false
    }));
    results.fields.add(new NumberField({ name: "seat_index", required: false }));
    results.fields.add(new NumberField({ name: "rank", required: false }));
    results.fields.add(new BoolField({ name: "is_bot", required: false }));
    results.fields.add(new AutodateField({ name: "created", onCreate: true }));
    results.fields.add(new AutodateField({ name: "updated", onCreate: true, onUpdate: true }));
    app.save(results);
}, (app) => {
    // Down migration
    try {
        const results = app.findCollectionByNameOrId("results");
        if (results) app.delete(results);
    } catch (e) {}

    try {
        const moves = app.findCollectionByNameOrId("moves");
        if (moves) app.delete(moves);
    } catch (e) {}

    try {
        const hands = app.findCollectionByNameOrId("hands");
        if (hands) app.delete(hands);
    } catch (e) {}

    try {
        const games = app.findCollectionByNameOrId("games");
        if (games) app.delete(games);
    } catch (e) {}

    try {
        const users = app.findCollectionByNameOrId("users");
        if (users) {
            const field = users.fields.getByName("display_name");
            if (field) {
                users.fields.remove(field);
                app.save(users);
            }
        }
    } catch (e) {}
});
