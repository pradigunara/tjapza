/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
    const users = app.findCollectionByNameOrId("users");
    // Enable public guest registration/signups
    users.createRule = "";
    app.save(users);
}, (app) => {
    // down migration
});
