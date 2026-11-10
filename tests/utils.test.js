const test = require("node:test");
const assert = require("node:assert/strict");
const { resolvePrefixCommand, parseDuration } = require("../src/utils");

test("resolves multi-word Arabic prefix commands before shorter commands", () => {
  assert.deepEqual(resolvePrefixCommand("مسح تحذير @user 3"), { command: "clearwarn", consumed: 2 });
  assert.deepEqual(resolvePrefixCommand("فك حظر 12345678901234567"), { command: "unban", consumed: 2 });
  assert.deepEqual(resolvePrefixCommand("معلومات السيرفر"), { command: "serverinfo", consumed: 2 });
  assert.deepEqual(resolvePrefixCommand("تحذيرات @user"), { command: "warnings", consumed: 1 });
  assert.deepEqual(resolvePrefixCommand("قيفوايات"), { command: "giveawaylist", consumed: 1 });
  assert.deepEqual(resolvePrefixCommand("الغاء تايم @user"), { command: "untimeout", consumed: 2 });
});

test("resolves single-word prefix commands", () => {
  assert.deepEqual(resolvePrefixCommand("حظر @user"), { command: "ban", consumed: 1 });
  assert.deepEqual(resolvePrefixCommand("قول hello world"), { command: "say", consumed: 1 });
  assert.deepEqual(resolvePrefixCommand("dm @user hello"), { command: "dm", consumed: 1 });
  assert.deepEqual(resolvePrefixCommand("صيانة تشغيل"), { command: "maintenance", consumed: 1 });
  assert.deepEqual(resolvePrefixCommand("قفل الروم"), { command: "lock", consumed: 2 });
  assert.deepEqual(resolvePrefixCommand("فتح الروم"), { command: "unlock", consumed: 2 });
  assert.deepEqual(resolvePrefixCommand("فتح"), { command: "unlock", consumed: 1 });
  assert.deepEqual(resolvePrefixCommand("بطء 10"), { command: "slowmode", consumed: 1 });
  assert.deepEqual(resolvePrefixCommand("اعلان نص"), { command: "announce", consumed: 1 });
  assert.deepEqual(resolvePrefixCommand("تنبيه @role نص"), { command: "notify", consumed: 1 });
  assert.deepEqual(resolvePrefixCommand("تذكير 10m نص"), { command: "reminder", consumed: 1 });
});

test("parses supported duration units and rejects invalid values", () => {
  assert.equal(parseDuration("10m"), 600000);
  assert.equal(parseDuration("2h"), 7200000);
  assert.equal(parseDuration("1d"), 86400000);
  assert.equal(parseDuration("5s"), 5000);
  assert.equal(parseDuration("0m"), null);
  assert.equal(parseDuration("3w"), null);
  assert.equal(parseDuration("abc"), null);
});
