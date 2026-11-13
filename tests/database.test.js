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

test("failed giveaway setup can be rolled back without leaving entries", () => {
  const guildId = `rollback-guild-${Date.now()}`;
  const result = statements.createGiveaway.run({
    guildId,
    channelId: "523456789012345678",
    hostId: "623456789012345678",
    prize: "Rollback prize",
    winnersCount: 1,
    endsAt: Date.now() + 60_000,
    createdAt: Date.now()
  });
  const giveawayId = Number(result.lastInsertRowid);
  statements.enterGiveaway.run(giveawayId, "723456789012345678", Date.now());
  assert.equal(statements.deleteGiveaway.run(giveawayId).changes, 1);
  assert.equal(statements.getGiveaway.get(giveawayId, guildId), undefined);
  assert.deepEqual(statements.getGiveawayEntries.all(giveawayId), []);
});

test("community data is persisted and deduplicated", () => {
  const guildId = "community-" + Date.now();
  const userId = "823456789012345678";
  const firstMessage = statements.recordMessage.get(guildId, userId);
  assert.equal(firstMessage.messages, 1);
  const xp = statements.addXp.get(guildId, userId, 25, Date.now());
  assert.equal(xp.xp, 25);
  assert.equal(statements.recordMessage.get(guildId, userId).messages, 2);
  assert.equal(statements.addXp.get(guildId, userId, 30, Date.now()).xp, 55);

  assert.equal(statements.unlockAchievement.run(guildId, userId, "first_message", Date.now()).changes, 1);
  assert.equal(statements.unlockAchievement.run(guildId, userId, "first_message", Date.now()).changes, 0);
  assert.equal(statements.getAchievements.all(guildId, userId).length, 1);

  statements.addBlockedWord.run(guildId, "badword", userId, Date.now());
  assert.deepEqual(statements.getBlockedWords.all(guildId).map(row => row.word), ["badword"]);
  assert.equal(statements.removeBlockedWord.run(guildId, "badword").changes, 1);

  const application = statements.createApplication.run(guildId, userId, JSON.stringify(["a", "b", "c", "d"]), Date.now());
  const applicationId = Number(application.lastInsertRowid);
  assert.equal(statements.reviewApplication.run("approved", userId, Date.now(), applicationId).changes, 1);
  assert.equal(statements.reviewApplication.run("rejected", userId, Date.now(), applicationId).changes, 0);

  const suggestion = statements.createSuggestion.run(guildId, "923456789012345678", userId, "A useful idea", Date.now());
  const suggestionId = Number(suggestion.lastInsertRowid);
  statements.voteSuggestion.run(suggestionId, userId, 1);
  statements.voteSuggestion.run(suggestionId, userId, -1);
  const votes = statements.getSuggestionVotes.get(suggestionId);
  assert.equal(votes.upvotes ?? 0, 0);
  assert.equal(votes.downvotes, 1);
});
