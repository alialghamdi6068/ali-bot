const test = require("node:test");
const assert = require("node:assert/strict");
const commands = require("../src/commands");

const names = new Set(commands.map(command => command.name));

test("all slash command and option names are lowercase English without underscores", () => {
  for (const command of commands) {
    const json = command.toJSON();
    assert.match(json.name, /^[a-z0-9-]+$/);
    for (const option of json.options ?? []) assert.match(option.name, /^[a-z0-9-]+$/);
  }
  assert.equal(names.size, commands.length, "Slash command names must be unique");
});

test("the agreed core slash commands are registered", () => {
  for (const name of ["ban", "unban", "kick", "timeout", "untimeout", "warn", "warnings", "clearwarn", "clear", "purge", "ticket", "close", "reopen", "delete", "add", "remove", "claim", "ticketconfig", "giveaway", "giveawaylist", "endgiveaway", "reroll", "say", "dm", "role", "removerole", "help", "commands", "userinfo", "serverinfo", "ping", "logs", "lock", "unlock", "slowmode", "announce", "notify"]) {
    assert.ok(names.has(name), `Missing slash command: ${name}`);
  }
});

test("unapproved community and maintenance systems are not exposed as slash commands", () => {
  for (const name of ["welcome", "autorole", "suggestions", "suggest", "suggestionreview", "applications", "apply", "antiswear", "level", "leaderboard", "invites", "achievements", "maintenance", "reminder"]) {
    assert.ok(!names.has(name), `Unexpected command exposed: ${name}`);
  }
});
