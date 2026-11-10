const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const dataDirectory = path.join(__dirname, "..", "data");
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
  getGiveaway: db.prepare("SELECT * FROM giveaways WHERE id = ? AND guild_id = ?"),
  getActiveGiveaways: db.prepare("SELECT * FROM giveaways WHERE status = 'active'"),
  enterGiveaway: db.prepare("INSERT OR IGNORE INTO giveaway_entries(giveaway_id, user_id, entered_at) VALUES(?, ?, ?)"),
  getGiveawayEntries: db.prepare("SELECT user_id FROM giveaway_entries WHERE giveaway_id = ?"),
  endGiveaway: db.prepare("UPDATE giveaways SET status = 'ended' WHERE id = ? AND status = 'active'"),
  addLog: db.prepare(`
    INSERT INTO logs(guild_id, actor_id, action, target_id, details, created_at)
    VALUES(?, ?, ?, ?, ?, ?)
  `),
  getLogs: db.prepare("SELECT * FROM logs WHERE guild_id = ? ORDER BY id DESC LIMIT 15")
};

module.exports = { db, statements };
