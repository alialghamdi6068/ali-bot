const test = require("node:test");
const assert = require("node:assert/strict");

process.env.DISCORD_TOKEN ||= "test-token";
process.env.GUILD_ID ||= "123456789012345678";

const { resolvePrefixCommand, parseDuration, formatDate } = require("../bot");

test("resolves Arabic prefix commands, including multi-word aliases", () => {
  assert.deepEqual(resolvePrefixCommand("حظر @member"), {
    command: "ban",
    consumed: 1
  });

  assert.deepEqual(resolvePrefixCommand("إغلاق تكت"), {
    command: "close",
    consumed: 2
  });
});

test("does not resolve disabled or unknown prefix commands", () => {
  assert.equal(resolvePrefixCommand("تذكير 10m test"), null);
  assert.equal(resolvePrefixCommand("شيء غير معروف"), null);
});

test("parses supported duration units", () => {
  assert.equal(parseDuration("10m"), 600_000);
  assert.equal(parseDuration("2h"), 7_200_000);
  assert.equal(parseDuration("1d"), 86_400_000);
  assert.equal(parseDuration("1s"), 1_000);
  assert.equal(parseDuration("3H"), 10_800_000);
});

test("rejects invalid durations", () => {
  for (const value of ["", "0m", "-1m", "1.5h", "5w", null, 12]) {
    assert.equal(parseDuration(value), null, String(value));
  }
});

test("formats dates consistently in UTC", () => {
  const formatted = formatDate(new Date("2024-01-01T00:00:00.000Z"));
  assert.match(formatted, /Jan 1, 2024/);
  assert.match(formatted, /12:00 AM/);
});
