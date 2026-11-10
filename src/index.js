require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  ActivityType,
  PresenceUpdateStatus,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require("discord.js");

const { statements } = require("./database");
const slashCommands = require("./commands");
const { randomInt } = require("node:crypto");
const { resolvePrefixCommand, parseDuration, formatDate } = require("./utils");
const { assertCanModerateMember, assertCanManageRole } = require("./permissions");

const requiredEnv = ["DISCORD_TOKEN", "GUILD_ID"];
for (const key of requiredEnv) {
  if (!process.env[key]?.trim()) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const PREFIX = "!";
const DEFAULT_REASON = "No reason provided.";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

function logAction(guildId, actorId, action, targetId, details) {
  try {
    statements.addLog.run(guildId, actorId, action, targetId ?? null, String(details), Date.now());
  } catch (error) {
    console.error("Failed to persist action log:", error);
  }
}

function isInConfiguredGuild(guild) {
  return guild?.id === GUILD_ID;
}

function hasPermission(member, permission) {
  return Boolean(member?.permissions?.has(permission));
}

function requirePermission(member, permission, label) {
  if (!hasPermission(member, permission)) {
    throw new Error(`You need the ${label} permission to use this command.`);
  }
}

function getMember(guild, user) {
  return guild.members.fetch(user.id);
}

const reminderTimers = new Map();

async function deliverReminder(reminder) {
  try {
    const channel = await client.channels.fetch(reminder.channel_id).catch(() => null);
    if (channel?.isTextBased()) {
      await channel.send({ content: '<@' + reminder.user_id + '> ⏰ Reminder: ' + reminder.message, allowedMentions: { users: [reminder.user_id] } });
    } else {
      const recipient = await client.users.fetch(reminder.user_id);
      await recipient.send('⏰ Reminder: ' + reminder.message);
    }
    statements.completeReminder.run("sent", reminder.id);
    logAction(reminder.guild_id, reminder.user_id, "reminder_sent", reminder.user_id, "Reminder #" + reminder.id);
  } catch (error) {
    console.error("Failed to deliver reminder #" + reminder.id + ":", error);
    statements.completeReminder.run("failed", reminder.id);
  } finally {
    reminderTimers.delete(reminder.id);
  }
}

function scheduleReminder(reminder) {
  if (reminderTimers.has(reminder.id)) clearTimeout(reminderTimers.get(reminder.id));
  const delay = Math.max(0, reminder.due_at - Date.now());
  const timer = setTimeout(() => {
    if (reminder.due_at > Date.now()) return scheduleReminder(reminder);
    deliverReminder(reminder);
  }, Math.min(delay, 2_147_000_000));
  timer.unref?.();
  reminderTimers.set(reminder.id, timer);
}

async function createReminder(context, durationText, message) {
  const duration = parseDuration(durationText);
  if (!duration || duration < 60_000 || duration > 30 * 24 * 60 * 60 * 1000) {
    throw new Error("Reminder duration must be between 1 minute and 30 days (examples: 10m, 2h, 1d).");
  }
  if (typeof message !== "string" || !message.trim() || message.length > 1000) {
    throw new Error("Reminder text must contain between 1 and 1000 characters.");
  }
  const dueAt = Date.now() + duration;
  const result = statements.createReminder.run(context.guild.id, context.user.id, context.channel.id, message.trim(), dueAt, Date.now());
  const id = Number(result.lastInsertRowid);
  scheduleReminder({ id, guild_id: context.guild.id, user_id: context.user.id, channel_id: context.channel.id, message: message.trim(), due_at: dueAt });
  logAction(context.guild.id, context.user.id, "reminder_create", context.user.id, "Reminder #" + id);
  await reply(context, "⏰ Reminder #" + id + " set for <t:" + Math.floor(dueAt / 1000) + ":F>.");
}

async function reply(context, content, ephemeral = true) {
  if (context.isInteraction) {
    const payload = typeof content === "string" ? { content } : content;
    if (context.replied || context.deferred) return context.followUp({ ...payload, flags: ephemeral ? MessageFlags.Ephemeral : undefined });
    return context.reply({ ...payload, flags: ephemeral ? MessageFlags.Ephemeral : undefined });
  }
  return context.reply(typeof content === "string" ? content : content);
}

function getTicket(channelId) {
  return statements.getTicketByChannel.get(channelId);
}

async function createTicket(context) {
  const { guild, user, channel } = context;
  const existing = statements.getOpenTicketByUser.get(guild.id, user.id);
  if (existing) throw new Error(`You already have an open ticket: <#${existing.channel_id}>.`);

  const number = statements.nextTicket.get().value;
  const staffOverwrites = guild.roles.cache
    .filter(role => role.id !== guild.roles.everyone.id && role.permissions.has(PermissionFlagsBits.ManageChannels))
    .map(role => ({ id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }));
  const ticketChannel = await guild.channels.create({
    name: String(number),
    type: ChannelType.GuildText,
    topic: `Ticket #${number} | Owner: ${user.id}`,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      ...staffOverwrites,
      {
        id: user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks
        ]
      },
      {
        id: client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageMessages
        ]
      }
    ],
    reason: `Ticket #${number} created by ${user.tag}`
  });

  try {
    statements.createTicket.run({
      number,
      guildId: guild.id,
      channelId: ticketChannel.id,
      userId: user.id,
      createdAt: Date.now()
    });
  } catch (error) {
    await ticketChannel.delete("Ticket database save failed").catch(() => {});
    throw new Error(`Ticket could not be saved and its channel was cleaned up where possible: ${error.message}`);
  }
  logAction(guild.id, user.id, "ticket_create", ticketChannel.id, `Ticket #${number}`);
  try {
    await ticketChannel.send({
      content: `<@!${user.id}>`,
      embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(`Ticket #${number}`).setDescription("Describe your issue here. A staff member will assist you.")],
      allowedMentions: { users: [user.id] }
    });
  } catch (error) {
    statements.updateTicketStatus.run("deleted", Date.now(), ticketChannel.id);
    await ticketChannel.delete("Ticket setup failed; cleaning up").catch(() => {});
    throw new Error(`Ticket was created but its welcome message failed. The channel was cleaned up where possible: ${error.message}`);
  }
  await reply(context, `Your ticket has been created: <#${ticketChannel.id}>.`);
}

async function closeTicket(context) {
  const ticket = getTicket(context.channel.id);
  if (!ticket || ticket.status !== "open") throw new Error("This channel is not an open ticket.");
  if (ticket.user_id !== context.user.id && !hasPermission(context.member, PermissionFlagsBits.ManageChannels)) {
    throw new Error("Only the ticket owner or staff can close this ticket.");
  }
  await context.channel.permissionOverwrites.edit(ticket.user_id, {
    SendMessages: false,
    AttachFiles: false
  });
  statements.updateTicketStatus.run("closed", Date.now(), context.channel.id);
  logAction(context.guild.id, context.user.id, "ticket_close", ticket.user_id, `Ticket #${ticket.number}`);
  await reply(context, `Ticket #${ticket.number} has been closed.`, false);
}

async function reopenTicket(context) {
  const ticket = getTicket(context.channel.id);
  if (!ticket || ticket.status !== "closed") throw new Error("This channel is not a closed ticket.");
  if (ticket.user_id !== context.user.id && !hasPermission(context.member, PermissionFlagsBits.ManageChannels)) {
    throw new Error("Only the ticket owner or staff can reopen this ticket.");
  }
  await context.channel.permissionOverwrites.edit(ticket.user_id, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
    AttachFiles: true
  });
  statements.updateTicketStatus.run("open", null, context.channel.id);
  logAction(context.guild.id, context.user.id, "ticket_reopen", ticket.user_id, `Ticket #${ticket.number}`);
  await reply(context, `Ticket #${ticket.number} has been reopened.`, false);
}

async function deleteTicket(context) {
  const ticket = getTicket(context.channel.id);
  if (!ticket) throw new Error("This channel is not a ticket.");
  requirePermission(context.member, PermissionFlagsBits.ManageChannels, "Manage Channels");
  await context.channel.delete(`Ticket #${ticket.number} deleted by ${context.user.tag}`);
  statements.updateTicketStatus.run("deleted", Date.now(), context.channel.id);
  logAction(context.guild.id, context.user.id, "ticket_delete", ticket.user_id, `Ticket #${ticket.number}`);
}

async function addTicketMember(context, target, remove = false) {
  const ticket = getTicket(context.channel.id);
  if (!ticket) throw new Error("This command can only be used inside a ticket.");
  requirePermission(context.member, PermissionFlagsBits.ManageChannels, "Manage Channels");
  await context.channel.permissionOverwrites.edit(target.id, remove
    ? { ViewChannel: false }
    : { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true });
  logAction(context.guild.id, context.user.id, remove ? "ticket_remove_member" : "ticket_add_member", target.id, `Ticket #${ticket.number}`);
  await reply(context, remove ? `Removed <@${target.id}> from this ticket.` : `Added <@${target.id}> to this ticket.`, false);
}

async function claimTicket(context) {
  const ticket = getTicket(context.channel.id);
  if (!ticket) throw new Error("This channel is not a ticket.");
  requirePermission(context.member, PermissionFlagsBits.ManageChannels, "Manage Channels");
  statements.claimTicket.run(context.user.id, context.channel.id);
  logAction(context.guild.id, context.user.id, "ticket_claim", ticket.user_id, `Ticket #${ticket.number}`);
  await reply(context, `Ticket #${ticket.number} claimed by <@${context.user.id}>.`, false);
}

async function createGiveaway(context, prize, durationText, winnersCount, targetChannel) {
  requirePermission(context.member, PermissionFlagsBits.ManageGuild, "Manage Server");
  const duration = parseDuration(durationText);
  if (typeof prize !== "string" || prize.trim().length < 1 || prize.length > 200) {
    throw new Error("Giveaway prize must contain between 1 and 200 characters.");
  }
  if (!duration || duration < 60_000 || duration > 30 * 24 * 60 * 60 * 1000) {
    throw new Error("Giveaway duration must be between 1 minute and 30 days (examples: 10m, 2h, 1d).");
  }
  if (!Number.isInteger(winnersCount) || winnersCount < 1 || winnersCount > 20) {
    throw new Error("Winner count must be between 1 and 20.");
  }

  const destination = targetChannel ?? context.channel;
  const endsAt = Date.now() + duration;
  const result = statements.createGiveaway.run({
    guildId: context.guild.id,
    channelId: destination.id,
    hostId: context.user.id,
    prize,
    winnersCount,
    endsAt,
    createdAt: Date.now()
  });
  const id = Number(result.lastInsertRowid);
  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("Giveaway")
    .setDescription(`**Prize:** ${prize}\n**Winners:** ${winnersCount}\n**Ends:** <t:${Math.floor(endsAt / 1000)}:R>\n**Hosted by:** <@${context.user.id}>`)
    .setFooter({ text: `Giveaway #${id}` });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`giveaway:enter:${id}`).setLabel("Enter Giveaway").setStyle(ButtonStyle.Primary)
  );
  let giveawayMessage;
  try {
    giveawayMessage = await destination.send({ embeds: [embed], components: [row] });
    const linked = statements.setGiveawayMessage.run(giveawayMessage.id, id);
    if (!linked.changes) throw new Error("Could not link the giveaway message to its database record.");
  } catch (error) {
    if (giveawayMessage) await giveawayMessage.delete("Giveaway setup failed").catch(() => {});
    statements.deleteGiveaway.run(id);
    throw new Error(`Giveaway creation failed and its database record was rolled back: ${error.message}`);
  }
  logAction(context.guild.id, context.user.id, "giveaway_create", null, `Giveaway #${id}: ${prize}`);
  scheduleGiveawayEnd(id, endsAt);
  await reply(context, `Giveaway #${id} created in <#${destination.id}>.`);
}

async function finishGiveawayInternal(giveaway, reroll = false) {
  const channel = await client.channels.fetch(giveaway.channel_id);
  if (!channel?.isTextBased()) throw new Error(`Giveaway #${giveaway.id} channel is unavailable; it will be retried.`);
  if (!giveaway.message_id) throw new Error(`Giveaway #${giveaway.id} has no linked message; refusing to mark it ended.`);
  const message = await channel.messages.fetch(giveaway.message_id);

  const shuffled = statements.getGiveawayEntries.all(giveaway.id).map(row => row.user_id);
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  const winners = shuffled.slice(0, Math.min(giveaway.winners_count, shuffled.length));
  const embed = new EmbedBuilder()
    .setColor(0x95a5a6)
    .setTitle("Giveaway Ended")
    .setDescription(`**Prize:** ${giveaway.prize}\n**Winners:** ${winners.length ? winners.map(id => `<@${id}>`).join(", ") : "No valid entries."}`)
    .setFooter({ text: `Giveaway #${giveaway.id}` });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`giveaway:ended:${giveaway.id}`).setLabel("Giveaway Ended").setStyle(ButtonStyle.Secondary).setDisabled(true)
  );

  // Only persist the ended state after Discord confirms the public giveaway message was updated.
  await message.edit({ embeds: [embed], components: [row] });
  if (!reroll) {
    const ended = statements.endGiveaway.run(giveaway.id);
    if (!ended.changes) {
      const current = statements.getGiveaway.get(giveaway.id, giveaway.guild_id);
      if (current?.status !== "ended") throw new Error(`Could not persist ended state for giveaway #${giveaway.id}.`);
    }
    if (ended.changes && winners.length) {
      await channel.send({
        content: `Congratulations ${winners.map(id => `<@${id}>`).join(", ")}! You won **${giveaway.prize}**.`,
        allowedMentions: { users: winners }
      }).catch(error => console.error(`Giveaway #${giveaway.id} ended, but winner announcement failed:`, error));
    }
  }
  return winners;
}

const giveawayFinishes = new Map();
function finishGiveaway(giveaway, reroll = false) {
  const key = `${giveaway.id}:${reroll ? "reroll" : "end"}`;
  if (giveawayFinishes.has(key)) return giveawayFinishes.get(key);
  const pending = finishGiveawayInternal(giveaway, reroll).finally(() => giveawayFinishes.delete(key));
  giveawayFinishes.set(key, pending);
  return pending;
}

const giveawayTimers = new Map();
function scheduleGiveawayEnd(id, endsAt) {
  if (giveawayTimers.has(id)) clearTimeout(giveawayTimers.get(id));
  const delay = Math.max(0, endsAt - Date.now());
  const timer = setTimeout(async () => {
    const giveaway = statements.getGiveaway.get(id, GUILD_ID);
    if (!giveaway || giveaway.status !== "active") {
      giveawayTimers.delete(id);
      return;
    }
    if (giveaway.ends_at > Date.now()) {
      scheduleGiveawayEnd(id, giveaway.ends_at);
      return;
    }
    try {
      await finishGiveaway(giveaway);
      giveawayTimers.delete(id);
    } catch (error) {
      console.error(`Failed to finish giveaway #${id}:`, error);
      scheduleGiveawayEnd(id, Date.now() + 60_000);
    }
  }, Math.min(delay, 2_147_000_000));
  timer.unref?.();
  giveawayTimers.set(id, timer);
}

async function moderation(context, name, data) {
  const { guild, user, member } = context;
  const reason = data.reason?.trim() || DEFAULT_REASON;
  if (reason.length > 500) throw new Error("Moderation reason cannot exceed 500 characters.");

  if (name === "ban") {
    requirePermission(member, PermissionFlagsBits.BanMembers, "Ban Members");
    const targetMember = await getMember(guild, data.target);
    assertCanModerateMember({ actor: member, target: targetMember, bot: guild.members.me, guild });
    await targetMember.ban({ reason });
    logAction(guild.id, user.id, "ban", data.target.id, reason);
    await reply(context, `Banned <@${data.target.id}>. Reason: ${reason}`);
    return;
  }
  if (name === "unban") {
    requirePermission(member, PermissionFlagsBits.BanMembers, "Ban Members");
    await guild.bans.remove(data.userId, reason);
    logAction(guild.id, user.id, "unban", data.userId, reason);
    await reply(context, `Unbanned ${data.userId}.`);
    return;
  }
  if (name === "kick") {
    requirePermission(member, PermissionFlagsBits.KickMembers, "Kick Members");
    const targetMember = await getMember(guild, data.target);
    assertCanModerateMember({ actor: member, target: targetMember, bot: guild.members.me, guild });
    await targetMember.kick(reason);
    logAction(guild.id, user.id, "kick", data.target.id, reason);
    await reply(context, `Kicked <@${data.target.id}>. Reason: ${reason}`);
    return;
  }
  if (name === "timeout") {
    requirePermission(member, PermissionFlagsBits.ModerateMembers, "Moderate Members");
    const duration = parseDuration(data.duration);
    if (!duration || duration < 1_000 || duration > 28 * 24 * 60 * 60 * 1000) {
      throw new Error("Timeout duration must be between 1 second and 28 days (examples: 10m, 2h, 1d).");
    }
    const targetMember = await getMember(guild, data.target);
    assertCanModerateMember({ actor: member, target: targetMember, bot: guild.members.me, guild });
    await targetMember.timeout(duration, reason);
    logAction(guild.id, user.id, "timeout", data.target.id, `${data.duration}: ${reason}`);
    await reply(context, `Timed out <@${data.target.id}> for ${data.duration}. Reason: ${reason}`);
    return;
  }
  if (name === "untimeout") {
    requirePermission(member, PermissionFlagsBits.ModerateMembers, "Moderate Members");
    const targetMember = await getMember(guild, data.target);
    assertCanModerateMember({ actor: member, target: targetMember, bot: guild.members.me, guild });
    await targetMember.timeout(null, "Timeout removed by moderator");
    logAction(guild.id, user.id, "untimeout", data.target.id, "Timeout removed");
    await reply(context, `Removed timeout from <@${data.target.id}>.`);
    return;
  }
  if (name === "warn") {
    requirePermission(member, PermissionFlagsBits.ModerateMembers, "Moderate Members");
    if (typeof data.reason !== "string" || !data.reason.trim() || data.reason.length > 1000) {
      throw new Error("Warning reason must contain between 1 and 1000 characters.");
    }
    const targetMember = await getMember(guild, data.target);
    assertCanModerateMember({ actor: member, target: targetMember, bot: guild.members.me, guild });
    const warning = statements.addWarning.run(guild.id, data.target.id, user.id, data.reason.trim(), Date.now());
    const warningId = Number(warning.lastInsertRowid);
    let dmSent = true;
    try {
      await data.target.send({
        embeds: [new EmbedBuilder().setColor(0xe67e22).setTitle("You have received a warning")
          .setDescription(`**Server:** ${guild.name}\n**Reason:** ${data.reason}\n**Warning ID:** ${warningId}\n**Moderator:** ${user.tag}`)]
      });
    } catch { dmSent = false; }
    logAction(guild.id, user.id, "warn", data.target.id, `Warning #${warningId}: ${data.reason}`);
    await reply(context, `Warned <@${data.target.id}>. Warning #${warningId}. ${dmSent ? "A DM was sent." : "I could not DM this member (their DMs may be closed)."}`);
    return;
  }
  if (name === "warnings") {
    requirePermission(member, PermissionFlagsBits.ModerateMembers, "Moderate Members");
    const rows = statements.getWarnings.all(guild.id, data.target.id);
    const description = rows.length
      ? rows.map(w => `**#${w.id}** — ${w.reason}\nBy <@${w.moderator_id}> • <t:${Math.floor(w.created_at / 1000)}:R>`).join("\n\n")
      : "No warnings found.";
    await reply(context, { embeds: [new EmbedBuilder().setColor(0xe67e22).setTitle(`Warnings for ${data.target.tag}`).setDescription(description.slice(0, 4000))] });
    return;
  }
  if (name === "clearwarn") {
    requirePermission(member, PermissionFlagsBits.ModerateMembers, "Moderate Members");
    const targetMember = await getMember(guild, data.target);
    assertCanModerateMember({ actor: member, target: targetMember, bot: guild.members.me, guild });
    const result = statements.deleteWarning.run(data.warningId, guild.id, data.target.id);
    if (!result.changes) throw new Error("Warning not found for this member.");
    logAction(guild.id, user.id, "clear_warning", data.target.id, `Warning #${data.warningId}`);
    await reply(context, `Deleted warning #${data.warningId} for <@${data.target.id}>.`);
  }
}

async function execute(context, name, data = {}) {
  const { guild, member, user, channel } = context;
  if (!guild || !isInConfiguredGuild(guild)) throw new Error("This bot is configured for one server only.");

  const maintenanceEnabled = statements.getSetting.get("maintenance_enabled")?.value === "1";
  if (maintenanceEnabled && name !== "maintenance" && !hasPermission(member, PermissionFlagsBits.ManageGuild)) {
    const notice = statements.getSetting.get("maintenance_reason")?.value || "The server is currently under maintenance.";
    throw new Error("Maintenance mode is enabled. " + notice);
  }

  if (["ban", "unban", "kick", "timeout", "untimeout", "warn", "warnings", "clearwarn"].includes(name)) {
    return moderation(context, name, data);
  }

  switch (name) {
    case "maintenance": {
      requirePermission(member, PermissionFlagsBits.ManageGuild, "Manage Server");
      const enabled = Boolean(data.enabled);
      const reason = typeof data.reason === "string" && data.reason.trim() ? data.reason.trim().slice(0, 500) : "The server is currently under maintenance.";
      statements.setSetting.run("maintenance_enabled", enabled ? "1" : "0");
      statements.setSetting.run("maintenance_reason", enabled ? reason : "");
      logAction(guild.id, user.id, "maintenance", null, enabled ? "Enabled: " + reason : "Disabled");
      await reply(context, enabled ? "🔧 Maintenance mode enabled. " + reason : "✅ Maintenance mode disabled.", false);
      break;
    }
    case "lock": {
      requirePermission(member, PermissionFlagsBits.ManageChannels, "Manage Channels");
      if (!channel?.isTextBased() || !channel.permissionOverwrites) throw new Error("This command requires a text channel.");
      await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false, SendMessagesInThreads: false, CreatePublicThreads: false, CreatePrivateThreads: false });
      logAction(guild.id, user.id, "channel_lock", channel.id, channel.name);
      await reply(context, "🔒 Locked <#" + channel.id + ">.", false);
      break;
    }
    case "unlock": {
      requirePermission(member, PermissionFlagsBits.ManageChannels, "Manage Channels");
      if (!channel?.isTextBased() || !channel.permissionOverwrites) throw new Error("This command requires a text channel.");
      await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null, SendMessagesInThreads: null, CreatePublicThreads: null, CreatePrivateThreads: null });
      logAction(guild.id, user.id, "channel_unlock", channel.id, channel.name);
      await reply(context, "🔓 Unlocked <#" + channel.id + ">.", false);
      break;
    }
    case "slowmode": {
      requirePermission(member, PermissionFlagsBits.ManageChannels, "Manage Channels");
      const seconds = Number(data.seconds);
      if (!Number.isInteger(seconds) || seconds < 0 || seconds > 21600) throw new Error("Slowmode must be between 0 and 21600 seconds.");
      if (!channel?.setRateLimitPerUser) throw new Error("This channel does not support slowmode.");
      await channel.setRateLimitPerUser(seconds, "Slowmode changed by " + user.tag);
      logAction(guild.id, user.id, "slowmode", channel.id, seconds + " seconds");
      await reply(context, seconds ? "🐢 Slowmode set to " + seconds + " seconds." : "🐢 Slowmode disabled.", false);
      break;
    }
    case "announce": {
      requirePermission(member, PermissionFlagsBits.ManageGuild, "Manage Server");
      if (typeof data.message !== "string" || !data.message.trim() || data.message.length > 2000) throw new Error("Announcement must contain between 1 and 2000 characters.");
      const embed = new EmbedBuilder().setColor(0x5865f2).setTitle("📢 Announcement").setDescription(data.message.trim()).setFooter({ text: "Announcement by " + user.tag }).setTimestamp();
      await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
      logAction(guild.id, user.id, "announce", channel.id, data.message.slice(0, 500));
      await reply(context, "Announcement sent.");
      break;
    }
    case "notify": {
      requirePermission(member, PermissionFlagsBits.ManageGuild, "Manage Server");
      if (typeof data.message !== "string" || !data.message.trim() || data.message.length > 2000) throw new Error("Notification must contain between 1 and 2000 characters.");
      const role = data.role ?? null;
      if (role && !role.mentionable && !hasPermission(member, PermissionFlagsBits.MentionEveryone)) throw new Error("The role is not mentionable. You need Mention Everyone permission to notify it.");
      const prefix = role ? "<@&" + role.id + "> " : "";
      await channel.send({ content: prefix + data.message.trim(), allowedMentions: { roles: role ? [role.id] : [], parse: [] } });
      logAction(guild.id, user.id, "notify", channel.id, data.message.slice(0, 500));
      await reply(context, "Notification sent.");
      break;
    }
    case "reminder":
      return createReminder(context, data.duration, data.message);
    case "clear": {
      requirePermission(member, PermissionFlagsBits.ManageMessages, "Manage Messages");
      const amount = Number(data.amount);
      if (!Number.isInteger(amount) || amount < 1 || amount > 100) throw new Error("Amount must be between 1 and 100.");
      const deleted = await channel.bulkDelete(amount, true);
      await reply(context, `Deleted ${deleted.size} messages.`);
      logAction(guild.id, user.id, "clear", null, `Deleted ${deleted.size} messages`);
      break;
    }
    case "ticket": return createTicket(context);
    case "close": return closeTicket(context);
    case "reopen": return reopenTicket(context);
    case "delete": return deleteTicket(context);
    case "add": return addTicketMember(context, data.target, false);
    case "remove": return addTicketMember(context, data.target, true);
    case "claim": return claimTicket(context);
    case "giveaway": return createGiveaway(context, data.prize, data.duration, data.winnersCount, data.targetChannel);
    case "giveawaylist": {
      requirePermission(member, PermissionFlagsBits.ManageGuild, "Manage Server");
      const rows = statements.getGuildActiveGiveaways.all(guild.id);
      const description = rows.length
        ? rows.map(item => `**#${item.id}** — ${item.prize} • ${item.winners_count} winner(s) • Ends <t:${Math.floor(item.ends_at / 1000)}:R> • <#${item.channel_id}>`).join("\n")
        : "There are no active giveaways.";
      await reply(context, { embeds: [new EmbedBuilder().setColor(0xf1c40f).setTitle("Active Giveaways").setDescription(description.slice(0, 4000))] });
      break;
    }
    case "endgiveaway":
    case "reroll": {
      requirePermission(member, PermissionFlagsBits.ManageGuild, "Manage Server");
      const giveaway = statements.getGiveaway.get(data.giveawayId, guild.id);
      if (!giveaway) throw new Error("Giveaway not found.");
      if (name === "endgiveaway" && giveaway.status !== "active") throw new Error("This giveaway has already ended.");
      if (name === "reroll" && giveaway.status !== "ended") throw new Error("You can only reroll a giveaway that has ended.");
      const winners = await finishGiveaway(giveaway, name === "reroll");
      if (name === "endgiveaway") {
        logAction(guild.id, user.id, "giveaway_end", null, `Giveaway #${giveaway.id}`);
        await reply(context, `Giveaway #${giveaway.id} ended. Winners: ${winners.length ? winners.map(id => `<@${id}>`).join(", ") : "none"}.`);
      } else {
        await reply(context, `Giveaway #${giveaway.id} rerolled. Winners: ${winners.length ? winners.map(id => `<@${id}>`).join(", ") : "none"}.`);
      }
      break;
    }
    case "say": {
      requirePermission(member, PermissionFlagsBits.ManageMessages, "Manage Messages");
      if (typeof data.message !== "string" || data.message.length < 1 || data.message.length > 2000) throw new Error("Message must contain between 1 and 2000 characters.");
      await channel.send({ content: data.message, allowedMentions: { parse: ["everyone", "users", "roles"] } });
      logAction(guild.id, user.id, "say", null, data.message.slice(0, 500));
      if (context.isInteraction) await reply(context, "Message sent.");
      break;
    }
    case "dm": {
      requirePermission(member, PermissionFlagsBits.ManageMessages, "Manage Messages");
      if (typeof data.message !== "string" || data.message.length < 1 || data.message.length > 2000) throw new Error("Message must contain between 1 and 2000 characters.");
      await data.target.send({ content: data.message, allowedMentions: { parse: ["users", "roles", "everyone"] } });
      logAction(guild.id, user.id, "dm", data.target.id, data.message.slice(0, 500));
      await reply(context, `Direct message sent to <@${data.target.id}>.`);
      break;
    }
    case "role":
    case "removerole": {
      requirePermission(member, PermissionFlagsBits.ManageRoles, "Manage Roles");
      const targetMember = await getMember(guild, data.target);
      assertCanManageRole({ actor: member, target: targetMember, bot: guild.members.me, role: data.role, everyoneRoleId: guild.id, guild });
      if (name === "role") await targetMember.roles.add(data.role);
      else await targetMember.roles.remove(data.role);
      logAction(guild.id, user.id, name, data.target.id, data.role.name);
      await reply(context, name === "role" ? `Added **${data.role.name}** to <@${data.target.id}>.` : `Removed **${data.role.name}** from <@${data.target.id}>.`);
      break;
    }
    case "help": {
      const embed = new EmbedBuilder().setColor(0x5865f2).setTitle("Ali Bot Commands").setDescription([
        "**Moderation**",
        "`/ban` • `/unban` • `/kick` • `/timeout` • `/untimeout` • `/warn` • `/warnings` • `/clearwarn` • `/clear`",
        "**Tickets**",
        "`/ticket` • `/close` • `/reopen` • `/delete` • `/add` • `/remove` • `/claim`",
        "**Giveaways**",
        "`/giveaway` • `/giveawaylist` • `/endgiveaway` • `/reroll`",
        "**Other**",
        "`/say` • `/dm` • `/role` • `/removerole` • `/userinfo` • `/serverinfo` • `/ping` • `/logs`",
        "**Server tools**",
        "`/maintenance` • `/lock` • `/unlock` • `/slowmode` • `/announce` • `/notify` • `/reminder`",
        "**Arabic prefix**",
        "`!حظر` • `!فك حظر` • `!طرد` • `!تايم` • `!إلغاء تايم` • `!تحذير` • `!عرض تحذيرات` • `!مسح تحذير` • `!مسح`",
        "`!تكت` • `!إغلاق تكت` • `!فتح تكت` • `!حذف تكت` • `!إضافة عضو` • `!إزالة عضو` • `!استلام تكت`",
        "`!قيفواي` • `!قيفوايات` • `!إنهاء قيفواي` • `!إعادة سحب` • `!قول` • `!dm` • `!رتبة` • `!سحب رتبة` • `!مساعدة`",
        "`!صيانة` • `!قفل` • `!فتح` • `!بطء` • `!اعلان` • `!تنبيه` • `!تذكير`"
      ].join("\n"));
      await reply(context, { embeds: [embed] });
      break;
    }
    case "userinfo": {
      const target = data.target ?? user;
      const targetMember = await getMember(guild, target);
      const embed = new EmbedBuilder().setColor(0x5865f2).setTitle(`User info: ${target.tag}`)
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: "ID", value: target.id, inline: true },
          { name: "Joined server", value: targetMember.joinedAt ? formatDate(targetMember.joinedAt) : "Unknown", inline: true },
          { name: "Account created", value: formatDate(target.createdAt), inline: true }
        );
      await reply(context, { embeds: [embed] });
      break;
    }
    case "serverinfo": {
      const embed = new EmbedBuilder().setColor(0x5865f2).setTitle(guild.name).setThumbnail(guild.iconURL())
        .addFields(
          { name: "Server ID", value: guild.id, inline: true },
          { name: "Members", value: String(guild.memberCount), inline: true },
          { name: "Created", value: formatDate(guild.createdAt), inline: true }
        );
      await reply(context, { embeds: [embed] });
      break;
    }
    case "ping":
      await reply(context, `Pong: ${client.ws.ping}ms`);
      break;
    case "logs": {
      requirePermission(member, PermissionFlagsBits.ViewAuditLog, "View Audit Log");
      const rows = statements.getLogs.all(guild.id);
      const description = rows.length
        ? rows.map(row => `**#${row.id} ${row.action}** • <@${row.actor_id}> • ${row.details.slice(0, 160)} • <t:${Math.floor(row.created_at / 1000)}:R>`).join("\n")
        : "No logs recorded yet.";
      await reply(context, { embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle("Recent Logs").setDescription(description.slice(0, 4000))] });
      break;
    }
    default:
      throw new Error("Unknown command. Use !مساعدة or /help.");
  }
}

function parsePrefixArguments(message, commandName) {
  const body = message.content.slice(PREFIX.length).trim();
  const commandText = body.slice(commandName.length).trim();
  const args = commandText.split(/\s+/).filter(Boolean);
  return { raw: commandText, args };
}

function parseMention(message, token) {
  const id = token?.replace(/[<@!>]/g, "");
  if (/^\d{17,20}$/.test(id ?? "")) return client.users.fetch(id);
  return message.mentions.users.first() ?? null;
}

async function handlePrefix(message) {
  if (message.author.bot || !message.guild || message.guild.id !== GUILD_ID || !message.content.startsWith(PREFIX)) return;
  const resolved = resolvePrefixCommand(message.content.slice(PREFIX.length).trim());
  if (!resolved) return;
  const { command, consumed } = resolved;
  const raw = message.content.slice(PREFIX.length).trim().split(/\s+/).slice(consumed).join(" ").trim();
  const args = raw.split(/\s+/).filter(Boolean);
  const context = {
    guild: message.guild,
    member: message.member,
    user: message.author,
    channel: message.channel,
    isInteraction: false,
    reply: message.reply.bind(message)
  };

  try {
    let data = {};
    const target = async (index = 0) => {
      const user = await parseMention(message, args[index]);
      if (!user) throw new Error("Mention a valid member or provide their user ID.");
      return user;
    };
    const reasonAfterTarget = (index = 1) => args.slice(index).join(" ").trim();

    switch (command) {
      case "ban": case "kick": case "untimeout": case "warnings":
        data.target = await target();
        data.reason = reasonAfterTarget();
        break;
      case "unban":
        data.userId = args[0]?.replace(/[<@!>]/g, "");
        if (!/^\d{17,20}$/.test(data.userId ?? "")) throw new Error("Provide a valid user ID.");
        data.reason = args.slice(1).join(" ");
        break;
      case "timeout":
        data.target = await target();
        data.duration = args[1];
        data.reason = reasonAfterTarget(2);
        if (!data.duration) throw new Error("Usage: !تايم @member 10m reason");
        break;
      case "warn":
        data.target = await target();
        data.reason = reasonAfterTarget();
        if (!data.reason) throw new Error("Usage: !تحذير @member reason");
        break;
      case "clearwarn":
        data.target = await target();
        data.warningId = Number(args[1]);
        if (!Number.isInteger(data.warningId)) throw new Error("Usage: !مسح تحذير @member warning_id");
        break;
      case "clear":
        data.amount = Number(args[0]);
        break;
      case "add": case "remove": case "dm":
        data.target = await target();
        if (command === "dm") {
          data.message = reasonAfterTarget();
          if (!data.message) throw new Error("Usage: !dm @member message");
        }
        break;
      case "role": case "removerole": {
        data.target = await target();
        const role = message.mentions.roles.first();
        if (!role) throw new Error("Mention a role.");
        data.role = role;
        break;
      }
      case "say":
        data.message = raw;
        if (!data.message) throw new Error("Usage: !قول message");
        break;
      case "giveaway": {
        const durationIndex = args.findIndex(part => /^\d+[smhd]$/i.test(part));
        const duration = args[durationIndex];
        const winnersCount = Number(args[durationIndex + 1]);
        const prize = args.slice(durationIndex + 2).join(" ");
        if (!duration || !prize || !Number.isInteger(winnersCount)) throw new Error("Usage: !قيفواي 10m 1 prize name");
        data = { duration, winnersCount, prize };
        break;
      }
      case "endgiveaway": case "reroll":
        data.giveawayId = Number(args[0]);
        if (!Number.isInteger(data.giveawayId)) throw new Error("Provide a giveaway ID.");
        break;
      case "maintenance": {
        const mode = args[0];
        if (!["تشغيل", "ايقاف", "إيقاف", "on", "off"].includes(mode)) throw new Error("Usage: !صيانة تشغيل reason OR !صيانة إيقاف");
        data.enabled = ["تشغيل", "on"].includes(mode);
        data.reason = args.slice(1).join(" ");
        break;
      }
      case "slowmode":
        data.seconds = Number(args[0]);
        break;
      case "announce":
        data.message = raw;
        break;
      case "notify": {
        data.role = message.mentions.roles.first() ?? null;
        data.message = data.role ? raw.replace("<@&" + data.role.id + ">", "").trim() : raw;
        break;
      }
      case "reminder":
        data.duration = args[0];
        data.message = args.slice(1).join(" ");
        if (!data.duration || !data.message) throw new Error("Usage: !تذكير 10m message");
        break;
      case "userinfo":
        data.target = args.length ? await target() : message.author;
        break;
      default:
        break;
    }
    await execute(context, command, data);
  } catch (error) {
    await message.reply({ content: `Error: ${error.message}`, allowedMentions: { repliedUser: false } }).catch(() => {});
  }
}

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  try {
    const configuredGuild = await client.guilds.fetch(GUILD_ID);
    await configuredGuild.commands.set(slashCommands);
    console.log(`Registered ${slashCommands.length} slash commands for guild ${GUILD_ID}.`);
  } catch (error) {
    console.error("Failed to register guild slash commands:", error);
  }
  client.user.setPresence({
    status: PresenceUpdateStatus.DoNotDisturb,
    activities: [{ name: "𝓐𝓵𝓲 𝓐𝓵𝓰𝓱𝓪𝓶𝓭𝓲", type: ActivityType.Watching }]
  });

  for (const giveaway of statements.getActiveGiveaways.all()) {
    scheduleGiveawayEnd(giveaway.id, giveaway.ends_at);
  }
  for (const reminder of statements.getPendingReminders.all()) {
    scheduleReminder(reminder);
  }
});

client.on("messageCreate", handlePrefix);

client.on("channelDelete", channel => {
  const ticket = getTicket(channel.id);
  if (ticket && ticket.status !== "deleted") {
    statements.updateTicketStatus.run("deleted", Date.now(), channel.id);
  }
});

client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isButton() && interaction.customId.startsWith("giveaway:enter:")) {
      if (!interaction.guild || interaction.guild.id !== GUILD_ID) return;
      const id = Number(interaction.customId.split(":")[2]);
      const giveaway = statements.getGiveaway.get(id, interaction.guild.id);
      if (!giveaway || giveaway.status !== "active" || giveaway.ends_at <= Date.now()) {
        return interaction.reply({ content: "This giveaway has ended.", flags: MessageFlags.Ephemeral });
      }
      const result = statements.enterGiveaway.run(id, interaction.user.id, Date.now());
      return interaction.reply({
        content: result.changes ? "You have entered the giveaway." : "You are already entered.",
        flags: MessageFlags.Ephemeral
      });
    }

    if (!interaction.isChatInputCommand()) return;
    if (!interaction.guild || interaction.guild.id !== GUILD_ID) {
      return interaction.reply({ content: "This bot is configured for one server only.", flags: MessageFlags.Ephemeral });
    }

    const name = interaction.commandName;
    const data = {};
    if (["ban", "kick", "timeout", "untimeout", "warn", "warnings", "clearwarn", "add", "remove", "dm", "role", "removerole"].includes(name)) {
      data.target = interaction.options.getUser("user");
    }
    if (name === "unban") data.userId = interaction.options.getString("userid");
    if (["ban", "kick", "timeout", "warn", "unban"].includes(name)) data.reason = interaction.options.getString("reason") ?? DEFAULT_REASON;
    if (name === "timeout") data.duration = interaction.options.getString("duration");
    if (name === "warn") data.reason = interaction.options.getString("reason");
    if (name === "clearwarn") data.warningId = interaction.options.getInteger("warningid");
    if (name === "clear") data.amount = interaction.options.getInteger("amount");
    if (name === "giveaway") {
      data.prize = interaction.options.getString("prize");
      data.duration = interaction.options.getString("duration");
      data.winnersCount = interaction.options.getInteger("winners");
      data.targetChannel = interaction.options.getChannel("channel");
    }
    if (["endgiveaway", "reroll"].includes(name)) data.giveawayId = interaction.options.getInteger("giveawayid");
    if (name === "say") data.message = interaction.options.getString("message");
    if (name === "dm") data.message = interaction.options.getString("message");
    if (["role", "removerole"].includes(name)) data.role = interaction.options.getRole("role");
    if (name === "userinfo") data.target = interaction.options.getUser("user") ?? interaction.user;
    if (name === "maintenance") {
      data.enabled = interaction.options.getBoolean("enabled");
      data.reason = interaction.options.getString("reason") ?? "";
    }
    if (name === "slowmode") data.seconds = interaction.options.getInteger("seconds");
    if (["announce", "notify"].includes(name)) data.message = interaction.options.getString("message");
    if (name === "notify") data.role = interaction.options.getRole("role");
    if (name === "reminder") {
      data.duration = interaction.options.getString("duration");
      data.message = interaction.options.getString("message");
    }

    const context = {
      guild: interaction.guild,
      member: await interaction.guild.members.fetch(interaction.user.id),
      user: interaction.user,
      channel: interaction.channel,
      isInteraction: true,
      reply: interaction.reply.bind(interaction),
      replied: interaction.replied,
      deferred: interaction.deferred
    };
    await execute(context, name, data);
  } catch (error) {
    console.error("Command error:", error);
    const payload = { content: `Error: ${error.message}`, flags: MessageFlags.Ephemeral };
    if (interaction.isRepliable()) {
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => {});
      else await interaction.reply(payload).catch(() => {});
    }
  }
});

client.on("error", error => console.error("Discord client error:", error));
process.on("unhandledRejection", error => console.error("Unhandled rejection:", error));

client.login(TOKEN).catch(error => {
  console.error("Failed to log in. Check DISCORD_TOKEN and bot configuration.", error);
  process.exitCode = 1;
});
