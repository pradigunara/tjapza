/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
    const hands = app.findCollectionByNameOrId("hands");
    hands.viewRule = "user_id = @request.auth.id || user_id = '' || user_id = null";
    hands.listRule = "user_id = @request.auth.id || user_id = '' || user_id = null";
    app.save(hands);
}, (app) => {
    const hands = app.findCollectionByNameOrId("hands");
    hands.viewRule = "user_id = @request.auth.id";
    hands.listRule = "user_id = @request.auth.id";
    app.save(hands);
});
