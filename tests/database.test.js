const test = require("node:test");
const after = require("node:test").after;
const assert = require("node:assert/strict");
const { db, statements } = require("../src/database");

after(() => db.close());

test("SQLite ticket counter increments without resetting", () => {
  const first = statements.nextTicket.get().value;
  const second = statements.nextTicket.get().value;
  assert.equal(second, first + 1);
});

test("warnings, giveaway entries, and logs are stored and queryable", () => {
  const guildId = `test-guild-${Date.now()}`;
  const userId = "123456789012345678";
  const warning = statements.addWarning.run(guildId, userId, "223456789012345678", "test reason", Date.now());
  const warningId = Number(warning.lastInsertRowid);
  assert.equal(statements.getWarnings.all(guildId, userId)[0].id, warningId);
  assert.equal(statements.deleteWarning.run(warningId, guildId, userId).changes, 1);

  const giveaway = statements.createGiveaway.run({
    guildId,
    channelId: "323456789012345678",
    hostId: "423456789012345678",
    prize: "Test prize",
    winnersCount: 1,
    endsAt: Date.now() + 60_000,
    createdAt: Date.now()
  });
  const giveawayId = Number(giveaway.lastInsertRowid);
  assert.equal(statements.enterGiveaway.run(giveawayId, userId, Date.now()).changes, 1);
  assert.equal(statements.enterGiveaway.run(giveawayId, userId, Date.now()).changes, 0);
  assert.deepEqual(statements.getGiveawayEntries.all(giveawayId).map(row => row.user_id), [userId]);

  statements.addLog.run(guildId, userId, "test", null, "test log", Date.now());
  assert.equal(statements.getLogs.all(guildId)[0].action, "test");
  statements.endGiveaway.run(giveawayId);
});
