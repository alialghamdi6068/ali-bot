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

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message TEXT NOT NULL,
    due_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_reminders_status_due
    ON reminders(status, due_at);

  CREATE TABLE IF NOT EXISTS suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS suggestion_votes (
    suggestion_id INTEGER NOT NULL REFERENCES suggestions(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    vote INTEGER NOT NULL CHECK(vote IN (-1, 1)),
    PRIMARY KEY(suggestion_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    answers_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    channel_id TEXT,
    message_id TEXT,
    reviewed_by TEXT,
    reviewed_at INTEGER,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS levels (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    xp INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 0,
    messages INTEGER NOT NULL DEFAULT 0,
    last_xp_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS invite_tracking (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    uses INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS achievements (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    achievement_key TEXT NOT NULL,
    unlocked_at INTEGER NOT NULL,
    PRIMARY KEY(guild_id, user_id, achievement_key)
  );

  CREATE TABLE IF NOT EXISTS blocked_words (
    guild_id TEXT NOT NULL,
    word TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY(guild_id, word)
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
  createReminder: db.prepare("INSERT INTO reminders(guild_id, user_id, channel_id, message, due_at, created_at) VALUES(?, ?, ?, ?, ?, ?)"),
  getPendingReminders: db.prepare("SELECT * FROM reminders WHERE status = 'pending' ORDER BY due_at"),
  completeReminder: db.prepare("UPDATE reminders SET status = ? WHERE id = ? AND status = 'pending'"),
    addLog: db.prepare(`
    INSERT INTO logs(guild_id, actor_id, action, target_id, details, created_at)
    VALUES(?, ?, ?, ?, ?, ?)
  `),
  getLogs: db.prepare("SELECT * FROM logs WHERE guild_id = ? ORDER BY id DESC LIMIT 15"),
  getSuggestionChannel: db.prepare("SELECT * FROM suggestions WHERE id = ? AND guild_id = ?"),
  updateSuggestionStatus: db.prepare("UPDATE suggestions SET status = ? WHERE id = ? AND guild_id = ?"),
  createSuggestion: db.prepare("INSERT INTO suggestions(guild_id, channel_id, user_id, content, created_at) VALUES(?, ?, ?, ?, ?)"),
  setSuggestionMessage: db.prepare("UPDATE suggestions SET message_id = ? WHERE id = ?"),
  deleteSuggestion: db.prepare("DELETE FROM suggestions WHERE id = ?"),
  voteSuggestion: db.prepare("INSERT INTO suggestion_votes(suggestion_id, user_id, vote) VALUES(?, ?, ?) ON CONFLICT(suggestion_id, user_id) DO UPDATE SET vote = excluded.vote"),
  getSuggestionVotes: db.prepare("SELECT SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END) AS upvotes, SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END) AS downvotes FROM suggestion_votes WHERE suggestion_id = ?"),
  createApplication: db.prepare("INSERT INTO applications(guild_id, user_id, answers_json, created_at) VALUES(?, ?, ?, ?)"),
  setApplicationMessage: db.prepare("UPDATE applications SET channel_id = ?, message_id = ? WHERE id = ?"),
  getApplication: db.prepare("SELECT * FROM applications WHERE id = ? AND guild_id = ?"),
  reviewApplication: db.prepare("UPDATE applications SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ? AND status = 'pending'"),
  recordMessage: db.prepare("INSERT INTO levels(guild_id, user_id, messages) VALUES(?, ?, 1) ON CONFLICT(guild_id, user_id) DO UPDATE SET messages = messages + 1 RETURNING *"),
  addXp: db.prepare("INSERT INTO levels(guild_id, user_id, xp, level, last_xp_at) VALUES(?, ?, ?, 0, ?) ON CONFLICT(guild_id, user_id) DO UPDATE SET xp = xp + excluded.xp, last_xp_at = excluded.last_xp_at RETURNING *"),
  setLevel: db.prepare("UPDATE levels SET level = ? WHERE guild_id = ? AND user_id = ?"),
  getLevel: db.prepare("SELECT * FROM levels WHERE guild_id = ? AND user_id = ?"),
  getLeaderboard: db.prepare("SELECT * FROM levels WHERE guild_id = ? ORDER BY level DESC, xp DESC LIMIT 10"),
  addInvite: db.prepare("INSERT INTO invite_tracking(guild_id, user_id, uses) VALUES(?, ?, 1) ON CONFLICT(guild_id, user_id) DO UPDATE SET uses = uses + 1"),
  getInvites: db.prepare("SELECT uses FROM invite_tracking WHERE guild_id = ? AND user_id = ?"),
  getTopInvites: db.prepare("SELECT * FROM invite_tracking WHERE guild_id = ? ORDER BY uses DESC LIMIT 10"),
  unlockAchievement: db.prepare("INSERT OR IGNORE INTO achievements(guild_id, user_id, achievement_key, unlocked_at) VALUES(?, ?, ?, ?)"),
  getAchievements: db.prepare("SELECT * FROM achievements WHERE guild_id = ? AND user_id = ? ORDER BY unlocked_at DESC"),
  getBlockedWords: db.prepare("SELECT word FROM blocked_words WHERE guild_id = ? ORDER BY word"),
  addBlockedWord: db.prepare("INSERT OR IGNORE INTO blocked_words(guild_id, word, created_by, created_at) VALUES(?, ?, ?, ?)"),
  removeBlockedWord: db.prepare("DELETE FROM blocked_words WHERE guild_id = ? AND word = ?"),
  saveTranscript: db.prepare("INSERT INTO ticket_transcripts(ticket_id, guild_id, content, created_at) VALUES(?, ?, ?, ?)"),
  getTicketByNumber: db.prepare("SELECT * FROM tickets WHERE guild_id = ? AND number = ?")
};

module.exports = { db, statements };
