const test = require("node:test");
const assert = require("node:assert/strict");
const commands = require("../src/commands");

test("all slash command and option names are lowercase English without underscores", () => {
  for (const command of commands) {
    const json = command.toJSON();
    assert.match(json.name, /^[a-z0-9-]+$/);
    for (const option of json.options ?? []) {
      assert.match(option.name, /^[a-z0-9-]+$/);
    }
  }
});

test("the required core slash commands are registered", () => {
  const names = new Set(commands.map(command => command.name));
  for (const name of ["ban", "unban", "timeout", "warn", "warnings", "ticket", "giveaway", "giveawaylist", "say", "dm", "role", "help", "maintenance", "lock", "unlock", "slowmode", "announce", "notify", "reminder"]) {
    assert.ok(names.has(name), `Missing slash command: ${name}`);
  }
});
