function assertCanModerateMember({ actor, target, bot, guild }) {
  if (!actor || !target || !bot) throw new Error("Could not verify member role hierarchy.");
  if (actor.id === target.id) throw new Error("You cannot use moderation commands on yourself.");
  if (guild?.ownerId === target.id) throw new Error("The server owner cannot be moderated.");
  if (bot.id === target.id) throw new Error("The bot cannot moderate itself.");
  if (target.roles.highest.position >= bot.roles.highest.position) {
    throw new Error("I cannot moderate a member with a role equal to or higher than my highest role.");
  }
  if (guild?.ownerId !== actor.id && target.roles.highest.position >= actor.roles.highest.position) {
    throw new Error("You cannot moderate a member with a role equal to or higher than your highest role.");
  }
}

function assertCanManageRole({ actor, target, bot, role, everyoneRoleId }) {
  if (!actor || !target || !bot || !role) throw new Error("Could not verify role hierarchy.");
  if (role.id === everyoneRoleId) throw new Error("The @everyone role cannot be managed with this command.");
  if (role.managed) throw new Error("Managed integration roles cannot be assigned manually.");
  if (role.position >= bot.roles.highest.position) {
    throw new Error("I cannot manage a role equal to or higher than my highest role.");
  }
  if (role.position >= actor.roles.highest.position) {
    throw new Error("You cannot manage a role equal to or higher than your highest role.");
  }
  if (target.id !== actor.id && target.roles.highest.position >= actor.roles.highest.position) {
    throw new Error("You cannot change roles for a target member with a role equal to or higher than your highest role.");
  }
  if (target.roles.highest.position >= bot.roles.highest.position) {
    throw new Error("I cannot change roles for a member with a role equal to or higher than my highest role.");
  }
}

module.exports = { assertCanModerateMember, assertCanManageRole };
