// Ali Bot — single-file Discord.js application.
// Configuration stays in .env. All bot systems and runtime logic live here.

require("dotenv").config();

const {
  Client,
  AuditLogEvent,
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
  AttachmentBuilder,
  MessageFlags
} = require("discord.js");
const { randomInt } = require("node:crypto");

// Database and persistent storage
const database = (() => {
const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const dataDirectory = path.join(__dirname, "data");
fs.mkdirSync(dataDirectory, { recursive: true });

const db = new Database(path.join(dataDirectory, "ali-bot.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

db.exec(`
  CREATE TABLE IF NOT EXISTS counters (
    name TEXT PRIMARY KEY,
    value INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number INTEGER NOT NULL UNIQUE,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    claimed_by TEXT,
    created_at INTEGER NOT NULL,
    closed_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_tickets_guild_user_status
    ON tickets(guild_id, user_id, status);

  CREATE TABLE IF NOT EXISTS warnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_warnings_guild_user
    ON warnings(guild_id, user_id, id);

  CREATE TABLE IF NOT EXISTS giveaways (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT,
    host_id TEXT NOT NULL,
    prize TEXT NOT NULL,
    winners_count INTEGER NOT NULL,
    ends_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS giveaway_entries (
    giveaway_id INTEGER NOT NULL REFERENCES giveaways(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    entered_at INTEGER NOT NULL,
    PRIMARY KEY (giveaway_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ticket_transcripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    guild_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target_id TEXT,
    details TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_logs_guild_id
    ON logs(guild_id, id DESC);
`);

const statements = {
  nextTicket: db.prepare(`
    INSERT INTO counters(name, value) VALUES('ticket', 1)
    ON CONFLICT(name) DO UPDATE SET value = value + 1
    RETURNING value
  `),
  createTicket: db.prepare(`
    INSERT INTO tickets(number, guild_id, channel_id, user_id, created_at)
    VALUES(@number, @guildId, @channelId, @userId, @createdAt)
  `),
  getTicketByChannel: db.prepare("SELECT * FROM tickets WHERE channel_id = ?"),
  getOpenTicketByUser: db.prepare("SELECT * FROM tickets WHERE guild_id = ? AND user_id = ? AND status = 'open'"),
  updateTicketStatus: db.prepare("UPDATE tickets SET status = ?, closed_at = ? WHERE channel_id = ?"),
  claimTicket: db.prepare("UPDATE tickets SET claimed_by = ? WHERE channel_id = ?"),
  addWarning: db.prepare(`
    INSERT INTO warnings(guild_id, user_id, moderator_id, reason, created_at)
    VALUES(?, ?, ?, ?, ?)
  `),
  getWarnings: db.prepare("SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY id DESC LIMIT 20"),
  deleteWarning: db.prepare("DELETE FROM warnings WHERE id = ? AND guild_id = ? AND user_id = ?"),
  createGiveaway: db.prepare(`
    INSERT INTO giveaways(guild_id, channel_id, host_id, prize, winners_count, ends_at, created_at)
    VALUES(@guildId, @channelId, @hostId, @prize, @winnersCount, @endsAt, @createdAt)
  `),
  setGiveawayMessage: db.prepare("UPDATE giveaways SET message_id = ? WHERE id = ?"),
  deleteGiveaway: db.prepare("DELETE FROM giveaways WHERE id = ?"),
  getGiveaway: db.prepare("SELECT * FROM giveaways WHERE id = ? AND guild_id = ?"),
  getActiveGiveaways: db.prepare("SELECT * FROM giveaways WHERE status = 'active'"),
  getGuildActiveGiveaways: db.prepare("SELECT * FROM giveaways WHERE guild_id = ? AND status = 'active' ORDER BY id DESC LIMIT 15"),
  enterGiveaway: db.prepare("INSERT OR IGNORE INTO giveaway_entries(giveaway_id, user_id, entered_at) VALUES(?, ?, ?)"),
  getGiveawayEntries: db.prepare("SELECT user_id FROM giveaway_entries WHERE giveaway_id = ?"),
  endGiveaway: db.prepare("UPDATE giveaways SET status = 'ended' WHERE id = ? AND status = 'active'"),
  getSetting: db.prepare("SELECT value FROM settings WHERE key = ?"),
  setSetting: db.prepare("INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"),
    addLog: db.prepare(`
    INSERT INTO logs(guild_id, actor_id, action, target_id, details, created_at)
    VALUES(?, ?, ?, ?, ?, ?)
  `),
  getLogs: db.prepare("SELECT * FROM logs WHERE guild_id = ? ORDER BY id DESC LIMIT 15"),
  saveTranscript: db.prepare("INSERT INTO ticket_transcripts(ticket_id, guild_id, content, created_at) VALUES(?, ?, ?, ?)"),
  getTicketByNumber: db.prepare("SELECT * FROM tickets WHERE guild_id = ? AND number = ?")
};
  return { db, statements };
})();
const { statements } = database;

// Slash command definitions
const slashCommands = (() => {
  const { SlashCommandBuilder, ChannelType } = require("discord.js");
  const commands = [  new SlashCommandBuilder().setName("ban").setDescription("Ban a member")
    .addUserOption(o => o.setName("user").setDescription("Member to ban").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setMaxLength(500)),
  new SlashCommandBuilder().setName("unban").setDescription("Unban a user")
    .addStringOption(o => o.setName("userid").setDescription("Discord user ID").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setMaxLength(500)),
  new SlashCommandBuilder().setName("kick").setDescription("Kick a member")
    .addUserOption(o => o.setName("user").setDescription("Member to kick").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setMaxLength(500)),
  new SlashCommandBuilder().setName("timeout").setDescription("Timeout a member")
    .addUserOption(o => o.setName("user").setDescription("Member to timeout").setRequired(true))
    .addStringOption(o => o.setName("duration").setDescription("Examples: 10m, 2h, 1d").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setMaxLength(500)),
  new SlashCommandBuilder().setName("untimeout").setDescription("Remove a member timeout")
    .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true)),
  new SlashCommandBuilder().setName("warn").setDescription("Warn a member")
    .addUserOption(o => o.setName("user").setDescription("Member to warn").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setMaxLength(500).setRequired(true)),
  new SlashCommandBuilder().setName("warnings").setDescription("Show a member's warnings")
    .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true)),
  new SlashCommandBuilder().setName("clearwarn").setDescription("Delete one warning")
    .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
    .addIntegerOption(o => o.setName("warningid").setDescription("Warning number").setRequired(true)),
  new SlashCommandBuilder().setName("clear").setDescription("Delete recent messages")
    .addIntegerOption(o => o.setName("amount").setDescription("1 to 100").setMinValue(1).setMaxValue(100).setRequired(true)),
  new SlashCommandBuilder().setName("purge").setDescription("Purge recent messages")
    .addIntegerOption(o => o.setName("amount").setDescription("1 to 100").setMinValue(1).setMaxValue(100).setRequired(true)),
  new SlashCommandBuilder().setName("ticket").setDescription("Create a support ticket")
    .addStringOption(o => o.setName("category").setDescription("Ticket category").addChoices(
      { name: "Support", value: "support" },
      { name: "Complaint", value: "complaint" },
      { name: "Partnership", value: "partnership" }
    )),
  new SlashCommandBuilder().setName("close").setDescription("Close this ticket"),
  new SlashCommandBuilder().setName("reopen").setDescription("Reopen this ticket"),
  new SlashCommandBuilder().setName("delete").setDescription("Delete this ticket"),
  new SlashCommandBuilder().setName("add").setDescription("Add a member to this ticket")
    .addUserOption(o => o.setName("user").setDescription("Member to add").setRequired(true)),
  new SlashCommandBuilder().setName("remove").setDescription("Remove a member from this ticket")
    .addUserOption(o => o.setName("user").setDescription("Member to remove").setRequired(true)),
  new SlashCommandBuilder().setName("claim").setDescription("Claim this ticket"),
  new SlashCommandBuilder().setName("giveaway").setDescription("Start a giveaway")
    .addStringOption(o => o.setName("prize").setDescription("Giveaway prize").setMaxLength(200).setRequired(true))
    .addStringOption(o => o.setName("duration").setDescription("Examples: 10m, 2h, 1d").setRequired(true))
    .addIntegerOption(o => o.setName("winners").setDescription("Number of winners").setMinValue(1).setMaxValue(20).setRequired(true))
    .addChannelOption(o => o.setName("channel").setDescription("Where to post").addChannelTypes(ChannelType.GuildText)),
  new SlashCommandBuilder().setName("giveawaylist").setDescription("List active giveaways"),
  new SlashCommandBuilder().setName("endgiveaway").setDescription("End a giveaway")
    .addIntegerOption(o => o.setName("giveawayid").setDescription("Giveaway number").setRequired(true)),
  new SlashCommandBuilder().setName("reroll").setDescription("Reroll giveaway winners")
    .addIntegerOption(o => o.setName("giveawayid").setDescription("Giveaway number").setRequired(true)),
  new SlashCommandBuilder().setName("say").setDescription("Make the bot send a message")
    .addStringOption(o => o.setName("message").setDescription("Message to send").setMaxLength(2000).setRequired(true)),
  new SlashCommandBuilder().setName("dm").setDescription("Send a direct message")
    .addUserOption(o => o.setName("user").setDescription("Recipient").setRequired(true))
    .addStringOption(o => o.setName("message").setDescription("Message text").setMaxLength(2000).setRequired(true)),
  new SlashCommandBuilder().setName("role").setDescription("Give a role to a member")
    .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
    .addRoleOption(o => o.setName("role").setDescription("Role to give").setRequired(true)),
  new SlashCommandBuilder().setName("removerole").setDescription("Remove a role from a member")
    .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
    .addRoleOption(o => o.setName("role").setDescription("Role to remove").setRequired(true)),
  new SlashCommandBuilder().setName("help").setDescription("Show all bot commands"),
  new SlashCommandBuilder().setName("commands").setDescription("List all bot commands"),
  new SlashCommandBuilder().setName("userinfo").setDescription("Show member information")
    .addUserOption(o => o.setName("user").setDescription("Member").setRequired(false)),
  new SlashCommandBuilder().setName("serverinfo").setDescription("Show server information"),
  new SlashCommandBuilder().setName("ping").setDescription("Show bot latency"),
  new SlashCommandBuilder().setName("lock").setDescription("Lock this text channel"),
  new SlashCommandBuilder().setName("unlock").setDescription("Unlock this text channel"),
  new SlashCommandBuilder().setName("slowmode").setDescription("Set channel slowmode")
    .addIntegerOption(o => o.setName("seconds").setDescription("0 to 21600 seconds").setMinValue(0).setMaxValue(21600).setRequired(true)),
  new SlashCommandBuilder().setName("announce").setDescription("Send an announcement embed")
    .addStringOption(o => o.setName("message").setDescription("Announcement text").setMaxLength(2000).setRequired(true)),
  new SlashCommandBuilder().setName("notify").setDescription("Send a notification, optionally pinging a role")
    .addStringOption(o => o.setName("message").setDescription("Notification text").setMaxLength(2000).setRequired(true))
    .addRoleOption(o => o.setName("role").setDescription("Role to notify")),
  new SlashCommandBuilder().setName("ticketconfig").setDescription("Configure ticket transcripts and category channels")
    .addChannelOption(o => o.setName("transcriptchannel").setDescription("Transcript channel").addChannelTypes(ChannelType.GuildText))
    .addChannelOption(o => o.setName("supportcategory").setDescription("Support category").addChannelTypes(ChannelType.GuildCategory))
    .addChannelOption(o => o.setName("complaintcategory").setDescription("Complaint category").addChannelTypes(ChannelType.GuildCategory))
    .addChannelOption(o => o.setName("partnershipcategory").setDescription("Partnership category").addChannelTypes(ChannelType.GuildCategory)),

  ];
  return commands;
})();

// Shared helpers
const utils = (() => {
const PREFIX_COMMANDS = [
  ["فك حظر", "unban"],
  ["إلغاء تايم", "untimeout"],
  ["الغاء تايم", "untimeout"],
  ["مسح تحذير", "clearwarn"],
  ["عرض تحذيرات", "warnings"],
  ["تحذيرات", "warnings"],
  ["إغلاق تكت", "close"],
  ["فتح تكت", "reopen"],
  ["حذف تكت", "delete"],
  ["إضافة عضو", "add"],
  ["اضافة عضو", "add"],
  ["ازالة عضو", "remove"],
  ["إزالة عضو", "remove"],
  ["استلام تكت", "claim"],
  ["إنهاء قيفواي", "endgiveaway"],
  ["انهاء قيفواي", "endgiveaway"],
  ["اعادة سحب", "reroll"],
  ["إعادة سحب", "reroll"],
  ["سحب رتبة", "removerole"],
  ["معلومات السيرفر", "serverinfo"],
  ["حظر", "ban"],
  ["طرد", "kick"],
  ["تايم", "timeout"],
  ["تحذير", "warn"],
  ["تكت", "ticket"],
  ["قيفوايات", "giveawaylist"],
  ["قيفواي", "giveaway"],
  ["قول", "say"],
  ["dm", "dm"],
  ["رتبة", "role"],
  ["مسح", "clear"],
  ["تنظيف", "purge"],
  ["أوامر", "commands"],
  ["اوامر", "commands"],
  ["مساعدة", "help"],
  ["معلومات", "userinfo"],
  ["بينق", "ping"],
  ["قفل", "lock"],
  ["قفل الروم", "lock"],
  ["فتح", "unlock"],
  ["فتح الروم", "unlock"],
  ["بطء", "slowmode"],
  ["اعلان", "announce"],
  ["إعلان", "announce"],
  ["تنبيه", "notify"],
  ["اعداد التكت", "ticketconfig"],
  ["إعداد التكت", "ticketconfig"],
  ["لوق", "logs"]
].sort((a, b) => b[0].length - a[0].length);


function resolvePrefixCommand(input) {
  const normalized = input.trim().toLocaleLowerCase("ar");
  for (const [label, command] of PREFIX_COMMANDS) {
    if (normalized === label || normalized.startsWith(label + " ")) {
      return { command, consumed: label.split(/\s+/).length };
    }
  }
  return null;
}

function parseDuration(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isSafeInteger(amount) || amount <= 0) return null;
  const multiplier = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2].toLowerCase()];
  const result = amount * multiplier;
  return Number.isSafeInteger(result) ? result : null;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(date);
}
  return { resolvePrefixCommand, parseDuration, formatDate };
})();
const { resolvePrefixCommand, parseDuration, formatDate } = utils;

// Permission and role hierarchy checks
const permissions = (() => {
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

function assertCanManageRole({ actor, target, bot, role, everyoneRoleId, guild }) {
  if (!actor || !target || !bot || !role) throw new Error("Could not verify role hierarchy.");
  if (role.id === everyoneRoleId) throw new Error("The @everyone role cannot be managed with this command.");
  if (role.managed) throw new Error("Managed integration roles cannot be assigned manually.");
  if (role.position >= bot.roles.highest.position) {
    throw new Error("I cannot manage a role equal to or higher than my highest role.");
  }
  if (guild?.ownerId !== actor.id && role.position >= actor.roles.highest.position) {
    throw new Error("You cannot manage a role equal to or higher than your highest role.");
  }
  if (guild?.ownerId === target.id && guild?.ownerId !== actor.id) {
    throw new Error("You cannot change roles for the server owner.");
  }
  if (guild?.ownerId !== actor.id && target.id !== actor.id && target.roles.highest.position >= actor.roles.highest.position) {
    throw new Error("You cannot change roles for a target member with a role equal to or higher than your highest role.");
  }
  if (target.roles.highest.position >= bot.roles.highest.position) {
    throw new Error("I cannot change roles for a member with a role equal to or higher than my highest role.");
  }
}
  return { assertCanModerateMember, assertCanManageRole };
})();
const { assertCanModerateMember, assertCanManageRole } = permissions;

// Supporting systems used by the bot
const community = (() => {
  const setting = key => statements.getSetting.get(key)?.value ?? "";
  const setSetting = (key, value) => statements.setSetting.run(key, String(value ?? ""));

  async function createTranscript(channel, ticket, guild, logAction) {
    const messages = [];
    let before;
  
    while (true) {
      const page = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
      if (!page.size) break;
  
      messages.push(...page.values());
      if (page.size < 100) break;
      if (messages.length >= 10000) {
        throw new Error("This ticket has more than 10,000 messages. The transcript was not marked as complete.");
      }
  
      before = page.last().id;
    }
  
    const ordered = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    const lines = ordered.map(message => {
      const attachments = [...message.attachments.values()].map(file => file.url);
      const embeds = message.embeds.map(embed => embed.title || embed.description || "[Embed]");
      const parts = [
        message.content || "",
        ...attachments.map(url => "[Attachment] " + url),
        ...embeds.map(value => "[Embed] " + value)
      ].filter(Boolean);
      const body = parts.join("\n") || "[Empty message]";
      return "[" + new Date(message.createdTimestamp).toISOString() + "] " +
        message.author.tag + " (" + message.author.id + "):\n" + body;
    });
  
    const content = "Ticket #" + ticket.number + " | " + guild.name +
      "\nOwner: " + ticket.user_id +
      "\nMessages: " + ordered.length +
      "\n\n" + lines.join("\n\n");
  
    statements.saveTranscript.run(ticket.id, guild.id, content, Date.now());
  
    const transcriptChannelId = setting("transcript_channel_id");
    if (transcriptChannelId) {
      const target = await guild.channels.fetch(transcriptChannelId).catch(() => null);
      if (!target?.isTextBased()) {
        throw new Error("The configured transcript channel is unavailable.");
      }
  
      const buffer = Buffer.from(content, "utf8");
      const chunkSize = 7 * 1024 * 1024;
      const files = [];
  
      for (let offset = 0, part = 1; offset < buffer.length; offset += chunkSize, part += 1) {
        const chunk = buffer.subarray(offset, Math.min(offset + chunkSize, buffer.length));
        const suffix = buffer.length > chunkSize ? "-part-" + part : "";
        files.push(new AttachmentBuilder(chunk, {
          name: "ticket-" + ticket.number + "-transcript" + suffix + ".txt"
        }));
      }
  
      await target.send({
        content: "Transcript for ticket #" + ticket.number + " (" + ordered.length + " messages).",
        files,
        allowedMentions: { parse: [] }
      });
    }
  
    logAction(guild.id, guild.client.user.id, "ticket_transcript", ticket.user_id,
      "Ticket #" + ticket.number + " — " + ordered.length + " messages");
  }

  return { setting, setSetting, createTranscript };
})();

// Main bot
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
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

function logAction(guildId, actorId, action, targetId, details) {
  const message = String(details ?? "").slice(0, 3500);

  try {
    statements.addLog.run(guildId, actorId || "system", action, targetId ?? null, message, Date.now());
  } catch (error) {
    console.error("Failed to save action log:", error);
    return;
  }

  const logChannelId = statements.getSetting.get("log_channel_id")?.value;
  if (!logChannelId || !client.isReady()) return;

  client.channels.fetch(logChannelId)
    .then(channel => {
      if (!channel?.isTextBased()) return null;

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(action.replaceAll("_", " ").toUpperCase())
        .setDescription(message || "No additional details.")
        .addFields(
          { name: "Actor", value: actorId && /^\d{17,20}$/.test(actorId) ? "<@" + actorId + ">" : (actorId || "System / unknown"), inline: true },
          { name: "Target", value: targetId ? "<@" + targetId + ">" : "None", inline: true }
        )
        .setTimestamp();

      return channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    })
    .catch(error => console.error("Could not send an automatic log:", error));
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

async function createTicket(context, category = "support") {
  const { guild, user, channel } = context;
  if (!["support", "complaint", "partnership"].includes(category)) throw new Error("Choose support, complaint, or partnership.");
  const existing = statements.getOpenTicketByUser.get(guild.id, user.id);
  if (existing) throw new Error(`You already have an open ticket: <#${existing.channel_id}>.`);

  const number = statements.nextTicket.get().value;
  const staffOverwrites = guild.roles.cache
    .filter(role => role.id !== guild.roles.everyone.id && role.permissions.has(PermissionFlagsBits.ManageChannels))
    .map(role => ({ id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }));
  const ticketChannel = await guild.channels.create({
    name: String(number),
    type: ChannelType.GuildText,
    parent: community.setting("ticket_category_" + category + "_id") || undefined,
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
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket:close:confirm:" + context.channel.id + ":" + context.user.id).setLabel("Confirm close").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("ticket:close:cancel:" + context.channel.id + ":" + context.user.id).setLabel("Cancel").setStyle(ButtonStyle.Secondary)
  );
  await reply(context, { content: "Are you sure you want to close ticket #" + ticket.number + "?", components: [row] });
}

async function handleTicketInteraction(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith("ticket:close:")) return false;
  const parts = interaction.customId.split(":");
  const action = parts[2];
  const channelId = parts[3];
  const requesterId = parts[4];
  if (!interaction.guild || interaction.guild.id !== GUILD_ID || !["confirm", "cancel"].includes(action)) return false;
  if (interaction.user.id !== requesterId && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
    await interaction.reply({ content: "Only the person who requested closure or ticket staff can use these buttons.", ephemeral: true });
    return true;
  }
  if (action === "cancel") {
    await interaction.update({ content: "Ticket closure cancelled.", components: [] });
    return true;
  }
  const ticket = getTicket(channelId);
  const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
  if (!ticket || ticket.status !== "open" || !channel) {
    await interaction.update({ content: "This ticket is no longer open.", components: [] });
    return true;
  }
  try {
    await community.createTranscript(channel, ticket, interaction.guild, logAction);
  } catch (error) {
    console.error("Ticket transcript failed:", error);
    logAction(interaction.guild.id, interaction.user.id, "ticket_transcript_failed", ticket.user_id, error.message);
    await interaction.update({
      content: "The transcript could not be saved. This ticket is still open; please try again later.",
      components: []
    });
    return true;
  }
  await channel.permissionOverwrites.edit(ticket.user_id, { SendMessages: false, AttachFiles: false });
  statements.updateTicketStatus.run("closed", Date.now(), channelId);
  logAction(interaction.guild.id, interaction.user.id, "ticket_close", ticket.user_id, "Ticket #" + ticket.number);
  await interaction.update({ content: "Ticket #" + ticket.number + " has been closed. The transcript was saved successfully.", components: [] });
  return true;
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
  try {
    await community.createTranscript(context.channel, ticket, context.guild, logAction);
  } catch (error) {
    logAction(context.guild.id, context.user.id, "ticket_transcript_failed", ticket.user_id, error.message);
    throw new Error("The transcript could not be saved, so the ticket was not deleted: " + error.message);
  }
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

  if (["ban", "unban", "kick", "timeout", "untimeout", "warn", "warnings", "clearwarn"].includes(name)) {
    return moderation(context, name, data);
  }

  switch (name) {
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
      if (role && !role.mentionable && (!hasPermission(member, PermissionFlagsBits.MentionEveryone) || !guild.members.me.permissions.has(PermissionFlagsBits.MentionEveryone))) {
        throw new Error("The role is not mentionable. Both you and the bot need Mention Everyone permission to notify it.");
      }
      const prefix = role ? "<@&" + role.id + "> " : "";
      await channel.send({ content: prefix + data.message.trim(), allowedMentions: { roles: role ? [role.id] : [], parse: [] } });
      logAction(guild.id, user.id, "notify", channel.id, data.message.slice(0, 500));
      await reply(context, "Notification sent.");
      break;
    }
    case "clear":
    case "purge": {
      requirePermission(member, PermissionFlagsBits.ManageMessages, "Manage Messages");
      const amount = Number(data.amount);
      if (!Number.isInteger(amount) || amount < 1 || amount > 100) throw new Error("Amount must be between 1 and 100.");
      const deleted = await channel.bulkDelete(amount, true);
      await reply(context, `Deleted ${deleted.size} messages.`);
      logAction(guild.id, user.id, "clear", null, `Deleted ${deleted.size} messages`);
      break;
    }
    case "ticket": return createTicket(context, data.category ?? "support");
    case "ticketconfig": {
      requirePermission(member, PermissionFlagsBits.ManageGuild, "Manage Server");
      const entries = [
        ["transcript_channel_id", data.transcriptChannel],
        ["ticket_category_support_id", data.supportCategory],
        ["ticket_category_complaint_id", data.complaintCategory],
        ["ticket_category_partnership_id", data.partnershipCategory]
      ];
      if (!entries.some(entry => entry[1])) throw new Error("Choose at least one transcript or ticket category channel.");
      if (data.transcriptChannel && !data.transcriptChannel.isTextBased()) throw new Error("Transcript destination must be a text channel.");
      for (const [key, value] of entries.slice(1)) {
        if (value && value.type !== ChannelType.GuildCategory) throw new Error("Ticket parents must be category channels.");
      }
      for (const [key, value] of entries) if (value) community.setSetting(key, value.id);
      logAction(guild.id, user.id, "ticket_config", null, entries.filter(x => x[1]).map(x => x[0]).join(", "));
      await reply(context, "Ticket settings updated.", false);
      break;
    }
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
    case "help":
    case "commands": {
      const embed = new EmbedBuilder().setColor(0x5865f2).setTitle("Ali Bot Commands").setDescription([
        "**Moderation**",
        "`/ban` • `/unban` • `/kick` • `/timeout` • `/untimeout` • `/warn` • `/warnings` • `/clearwarn` • `/clear` • `/purge`",
        "**Tickets**",
        "`/ticket` • `/close` • `/reopen` • `/delete` • `/add` • `/remove` • `/claim`",
        "**Giveaways**",
        "`/giveaway` • `/giveawaylist` • `/endgiveaway` • `/reroll`",
        "**Other**",
        "`/say` • `/dm` • `/role` • `/removerole` • `/userinfo` • `/serverinfo` • `/ping` • `/logs` • `/help` • `/commands",
        "**Server tools**",
        "`/lock` • `/unlock` • `/slowmode` • `/announce` • `/notify` • `/ticketconfig`",
        "**Arabic prefix**",
        "`!حظر` • `!فك حظر` • `!طرد` • `!تايم` • `!إلغاء تايم` • `!تحذير` • `!عرض تحذيرات` • `!مسح تحذير` • `!مسح` • `!تنظيف`",
        "`!تكت` • `!إغلاق تكت` • `!فتح تكت` • `!حذف تكت` • `!إضافة عضو` • `!إزالة عضو` • `!استلام تكت`",
        "`!قيفواي` • `!قيفوايات` • `!إنهاء قيفواي` • `!إعادة سحب` • `!قول` • `!dm` • `!رتبة` • `!سحب رتبة` • `!مساعدة` • `!أوامر`",
        "`!قفل` • `!فتح` • `!بطء` • `!اعلان` • `!تنبيه` • `!إعداد التكت`"
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
      if (data.channel) {
        requirePermission(member, PermissionFlagsBits.ManageGuild, "Manage Server");
        if (data.channel.guildId !== guild.id || !data.channel.isTextBased()) {
          throw new Error("Choose a text channel from this server.");
        }
        statements.setSetting.run("log_channel_id", data.channel.id);
        logAction(guild.id, user.id, "log_channel_config", data.channel.id, "Automatic logs channel configured");
        await reply(context, "Automatic logs will now be sent to <#" + data.channel.id + ">.", false);
        break;
      }

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
      case "clear": case "purge":
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
      case "ticket":
        data.category = ({ "دعم": "support", "شكوى": "complaint", "شراكة": "partnership" })[args[0]] ?? args[0] ?? "support";
        break;
      case "ticketconfig": {
        const mentioned = [...message.mentions.channels.values()];
        data.transcriptChannel = mentioned[0];
        data.supportCategory = mentioned[1];
        data.complaintCategory = mentioned[2];
        data.partnershipCategory = mentioned[3];
        break;
      }
        break;
      case "logs":
        data.channel = message.mentions.channels.first() ?? null;
        if (args.length && !data.channel) throw new Error("Mention a text channel to configure automatic logs.");
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
});

client.on("messageCreate", handlePrefix);

async function findAuditExecutor(guild, eventType, targetId) {
  if (!guild || !targetId) return null;

  try {
    const audit = await guild.fetchAuditLogs({ type: eventType, limit: 8 });
    const entry = audit.entries.find(item =>
      item.targetId === targetId && Date.now() - item.createdTimestamp < 15_000
    );
    return entry?.executor?.id ?? null;
  } catch {
    return null;
  }
}

function isConfiguredGuild(guild) {
  return Boolean(guild && guild.id === GUILD_ID);
}

client.on("messageDelete", async message => {
  if (message.partial) message = await message.fetch().catch(() => message);
  if (!isConfiguredGuild(message.guild) || message.author?.bot) return;
  const content = (message.content || "[No cached message content]").slice(0, 1500);
  const actorId = await findAuditExecutor(message.guild, AuditLogEvent.MessageDelete, message.author?.id);
  logAction(message.guild.id, actorId || message.author?.id || "system", "message_delete",
    message.author?.id, "Channel #" + message.channel?.name + ": " + content);
});

client.on("messageUpdate", async (oldMessage, newMessage) => {
  if (oldMessage.partial) oldMessage = await oldMessage.fetch().catch(() => oldMessage);
  if (newMessage.partial) newMessage = await newMessage.fetch().catch(() => newMessage);
  if (!isConfiguredGuild(newMessage.guild) || newMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return;
  logAction(newMessage.guild.id, newMessage.author?.id || client.user.id, "message_edit",
    newMessage.author?.id, "Channel #" + newMessage.channel?.name +
    "\nBefore: " + (oldMessage.content || "[Empty]").slice(0, 700) +
    "\nAfter: " + (newMessage.content || "[Empty]").slice(0, 700));
});

client.on("guildMemberAdd", member => {
  if (!isConfiguredGuild(member.guild)) return;
  logAction(member.guild.id, member.id, "member_join", member.id,
    member.user.tag + " joined the server");
});

client.on("guildMemberRemove", member => {
  if (!isConfiguredGuild(member.guild)) return;
  logAction(member.guild.id, member.id, "member_leave", member.id,
    (member.user?.tag || member.id) + " left the server");
});

client.on("guildMemberUpdate", async (oldMember, newMember) => {
  if (!isConfiguredGuild(newMember.guild)) return;
  const changes = [];
  const oldRoles = new Set(oldMember.roles.cache.keys());
  const newRoles = new Set(newMember.roles.cache.keys());
  const added = [...newRoles].filter(id => !oldRoles.has(id)).map(id => newMember.guild.roles.cache.get(id)?.name || id);
  const removed = [...oldRoles].filter(id => !newRoles.has(id)).map(id => oldMember.guild.roles.cache.get(id)?.name || id);
  if (added.length) changes.push("Roles added: " + added.join(", "));
  if (removed.length) changes.push("Roles removed: " + removed.join(", "));
  if (oldMember.nickname !== newMember.nickname) {
    changes.push("Nickname: " + (oldMember.nickname || oldMember.user.username) +
      " → " + (newMember.nickname || newMember.user.username));
  }
  if (changes.length) {
    const eventType = added.length || removed.length ? AuditLogEvent.MemberRoleUpdate : AuditLogEvent.MemberUpdate;
    const actorId = await findAuditExecutor(newMember.guild, eventType, newMember.id);
    logAction(newMember.guild.id, actorId || "system", "member_update", newMember.id, changes.join("\n"));
  }
});

client.on("channelCreate", async channel => {
  if (!isConfiguredGuild(channel.guild)) return;
  const actorId = await findAuditExecutor(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
  logAction(channel.guild.id, actorId || "system", "channel_create", channel.id,
    "Created #" + channel.name);
});

client.on("channelUpdate", async (oldChannel, newChannel) => {
  if (!isConfiguredGuild(newChannel.guild)) return;
  const changes = [];
  if (oldChannel.name !== newChannel.name) changes.push("Name: " + oldChannel.name + " → " + newChannel.name);
  if (oldChannel.topic !== newChannel.topic) changes.push("Topic changed");
  if (oldChannel.parentId !== newChannel.parentId) changes.push("Category changed");
  if (changes.length) logAction(newChannel.guild.id, client.user.id, "channel_update", newChannel.id, changes.join("\n"));
});

client.on("channelDelete", async channel => {
  if (!isConfiguredGuild(channel.guild)) return;
  const ticket = getTicket(channel.id);
  if (ticket && ticket.status !== "deleted") {
    statements.updateTicketStatus.run("deleted", Date.now(), channel.id);
  }
  const actorId = await findAuditExecutor(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
  logAction(channel.guild.id, actorId || "system", "channel_delete", channel.id, "Deleted #" + channel.name);
});

client.on("roleCreate", async role => {
  if (!isConfiguredGuild(role.guild)) return;
  const actorId = await findAuditExecutor(role.guild, AuditLogEvent.RoleCreate, role.id);
  logAction(role.guild.id, actorId || "system", "role_create", role.id, "Created role " + role.name);
});

client.on("roleUpdate", async (oldRole, newRole) => {
  if (!isConfiguredGuild(newRole.guild)) return;
  const changes = [];
  if (oldRole.name !== newRole.name) changes.push("Name: " + oldRole.name + " → " + newRole.name);
  if (oldRole.color !== newRole.color) changes.push("Color changed");
  if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) changes.push("Permissions changed");
  if (changes.length) logAction(newRole.guild.id, client.user.id, "role_update", newRole.id, changes.join("\n"));
});

client.on("roleDelete", async role => {
  if (!isConfiguredGuild(role.guild)) return;
  const actorId = await findAuditExecutor(role.guild, AuditLogEvent.RoleDelete, role.id);
  logAction(role.guild.id, actorId || "system", "role_delete", role.id, "Deleted role " + role.name);
});

client.on("guildBanAdd", async ban => {
  if (!isConfiguredGuild(ban.guild)) return;
  const actorId = await findAuditExecutor(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
  logAction(ban.guild.id, actorId || "system", "member_ban", ban.user.id, "Banned " + ban.user.tag);
});

client.on("guildBanRemove", async ban => {
  if (!isConfiguredGuild(ban.guild)) return;
  const actorId = await findAuditExecutor(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
  logAction(ban.guild.id, actorId || "system", "member_unban", ban.user.id, "Unbanned " + ban.user.tag);
});

client.on("interactionCreate", async interaction => {
  try {
    if (await handleTicketInteraction(interaction)) return;
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
    if (["clear", "purge"].includes(name)) data.amount = interaction.options.getInteger("amount");
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
    if (name === "logs") data.channel = interaction.options.getChannel("channel");
    if (name === "userinfo") data.target = interaction.options.getUser("user") ?? interaction.user;
    if (name === "slowmode") data.seconds = interaction.options.getInteger("seconds");
    if (["announce", "notify"].includes(name)) data.message = interaction.options.getString("message");
    if (name === "notify") data.role = interaction.options.getRole("role");
    if (name === "ticket") data.category = interaction.options.getString("category") ?? "support";
    if (name === "ticketconfig") {
      data.transcriptChannel = interaction.options.getChannel("transcriptchannel");
      data.supportCategory = interaction.options.getChannel("supportcategory");
      data.complaintCategory = interaction.options.getChannel("complaintcategory");
      data.partnershipCategory = interaction.options.getChannel("partnershipcategory");
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
