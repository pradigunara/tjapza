/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
    const games = app.findCollectionByNameOrId("games");
    let hasPassedSeats = false;
    for (let f of games.fields) {
        if (f.name === "passed_seats") {
            hasPassedSeats = true;
            break;
        }
    }
    if (!hasPassedSeats) {
        games.fields.add(new JSONField({
            name: "passed_seats",
            required: false,
        }));
        app.save(games);
    }
}, (app) => {
    // down migration
});
