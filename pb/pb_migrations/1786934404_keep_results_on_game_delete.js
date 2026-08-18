/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
    const results = app.findCollectionByNameOrId("results");
    const gameIdField = results.fields.getByName("game_id");
    if (gameIdField) {
        gameIdField.cascadeDelete = false;
        gameIdField.required = false;
        app.save(results);
    }
}, (app) => {
    // down migration
});
