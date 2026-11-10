const test = require("node:test");
const assert = require("node:assert/strict");
const { assertCanModerateMember, assertCanManageRole } = require("../src/permissions");

function member(id, position) {
  return { id, roles: { highest: { position } } };
}

test("moderation rejects a target with an equal or higher role", () => {
  const actor = member("actor", 5);
  const bot = member("bot", 10);
  assert.throws(() => assertCanModerateMember({ actor, target: member("target", 5), bot }), /equal to or higher/);
  assert.throws(() => assertCanModerateMember({ actor, target: member("target", 6), bot }), /equal to or higher/);
});

test("moderation rejects the bot being below the target and self-targeting", () => {
  const actor = member("actor", 8);
  assert.throws(() => assertCanModerateMember({ actor, target: member("target", 9), bot: member("bot", 8) }), /my highest role/);
  assert.throws(() => assertCanModerateMember({ actor, target: actor, bot: member("bot", 10) }), /yourself/);
});

test("server owner can moderate below-bot members but cannot target themselves", () => {
  const owner = member("owner", 1);
  const guild = { ownerId: "owner" };
  assert.doesNotThrow(() => assertCanModerateMember({ actor: owner, target: member("target", 9), bot: member("bot", 10), guild }));
  assert.throws(() => assertCanModerateMember({ actor: owner, target: owner, bot: member("bot", 10), guild }), /yourself/);
});

test("role changes require the role and target member below both actor and bot", () => {
  const actor = member("actor", 7);
  const bot = member("bot", 10);
  const role = { id: "role", position: 6, managed: false };
  assert.doesNotThrow(() => assertCanManageRole({ actor, target: member("target", 5), bot, role, everyoneRoleId: "guild" }));
  assert.throws(() => assertCanManageRole({ actor, target: member("target", 7), bot, role, everyoneRoleId: "guild" }), /target member/);
  assert.throws(() => assertCanManageRole({ actor, target: member("target", 5), bot, role: { ...role, position: 7 }, everyoneRoleId: "guild" }), /your highest role/);
  assert.throws(() => assertCanManageRole({ actor, target: member("target", 5), bot, role: { ...role, position: 10 }, everyoneRoleId: "guild" }), /my highest role/);
  assert.throws(() => assertCanManageRole({ actor, target: member("target", 5), bot, role: { ...role, id: "guild" }, everyoneRoleId: "guild" }), /@everyone/);
  assert.throws(() => assertCanManageRole({ actor, target: member("target", 5), bot, role: { ...role, managed: true }, everyoneRoleId: "guild" }), /Managed/);
});

test("server owner is exempt from actor hierarchy when managing roles", () => {
  const owner = member("owner", 1);
  const guild = { ownerId: "owner" };
  assert.doesNotThrow(() => assertCanManageRole({
    actor: owner,
    target: member("target", 9),
    bot: member("bot", 10),
    role: { id: "role", position: 8, managed: false },
    everyoneRoleId: "guild",
    guild
  }));
});
