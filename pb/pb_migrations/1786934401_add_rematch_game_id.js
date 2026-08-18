/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
    const games = app.findCollectionByNameOrId("games");
    let hasRematchField = false;
    for (let f of games.fields) {
        if (f.name === "rematch_game_id") {
            hasRematchField = true;
            break;
        }
    }
    if (!hasRematchField) {
        games.fields.add(new TextField({
            name: "rematch_game_id",
            required: false,
        }));
        app.save(games);
    }
}, (app) => {
    // down migration
});
