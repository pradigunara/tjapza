/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
    const users = app.findCollectionByNameOrId("users");
    // Restrict listRule so authenticated users cannot enumerate all other users' emails/PII
    users.listRule = "id = @request.auth.id";
    app.save(users);
}, (app) => {
    // down migration
});
