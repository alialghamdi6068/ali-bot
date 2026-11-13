# Ali Bot

A personal, single-server Discord management bot built with Node.js, Discord.js, and SQLite.

## Requirements

- Node.js 22.12 or newer
- A Discord application and bot
- A persistent host filesystem (the SQLite database is stored in `data/ali-bot.sqlite`)

## Setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env`.
3. Set only these two values:
   - `DISCORD_TOKEN`: the bot token. Keep it secret.
   - `GUILD_ID`: the one Discord server the bot is allowed to operate in.
4. In the Discord Developer Portal, enable **Message Content Intent** and **Server Members Intent** (Guild Members). They are required for Arabic `!` prefix commands, welcome messages, automatic roles, and member join tracking.
5. Invite the bot to the configured server with the `bot` and `applications.commands` OAuth scopes.
6. Give its role the permissions required by the features you intend to use: View Channels, Send Messages, Read Message History, Embed Links, Attach Files, Manage Channels, Manage Messages, Manage Roles, Ban Members, Kick Members, Moderate Members, and (if you want live @everyone/@here notifications) Mention Everyone. Keep the bot role above roles it must assign or moderate. Users who run `/logs` need View Audit Log. The bot role needs **Manage Server** to track invite usage.
7. Start it with `npm start`.

Slash commands are registered automatically to the configured server after the bot becomes ready. The bot does not register global commands.

## Commands

Slash commands use English names without underscores. Prefix commands use `!` and Arabic names; the prefix is fixed in code.

- Moderation: `/ban`, `/unban`, `/kick`, `/timeout`, `/untimeout`, `/warn`, `/warnings`, `/clearwarn`, `/clear`, `/purge`
- Tickets: `/ticket`, `/close`, `/reopen`, `/delete`, `/add`, `/remove`, `/claim`
- Giveaways: `/giveaway`, `/giveawaylist`, `/endgiveaway`, `/reroll`
- Utility: `/say`, `/dm`, `/role`, `/removerole`, `/help`, `/commands`, `/userinfo`, `/serverinfo`, `/ping`, `/logs`
- Server tools: `/maintenance`, `/lock`, `/unlock`, `/slowmode`, `/announce`, `/notify`, `/reminder`
- Community: `/welcome`, `/autorole`, `/suggestions`, `/suggest`, `/suggestionreview`, `/applications`, `/apply`, `/ticketconfig`, `/antiswear`, `/level`, `/leaderboard`, `/invites`, `/achievements`

Equivalent Arabic prefix commands are shown by `!مساعدة` and `/help`.

Examples:
- `!صيانة تشغيل Scheduled maintenance`
- `!قفل الروم` / `!فتح الروم`
- `!تنظيف 25` / `!أوامر`
- `!بطء 10`
- `!اعلان Server update`
- `!تنبيه @role Please check the update`
- `!تذكير 30m Check the support ticket`
- `!قناة ترحيب #welcome Welcome {user} to {server}!`
- `!رتبة تلقائية @Member`
- `!قناة اقتراحات #suggestions`
- `!اقتراح Add a new game night`
- `!مراجعة اقتراح 12 approved`
- `!قناة تقديمات #applications`
- `!تقديم age | timezone | experience | reason`
- `!إعداد التكت #transcripts`
- `!فلترة كلمات إضافة blockedword`
- `!مستوى` / `!المتصدرين` / `!دعوات` / `!إنجازات`
- `!حظر @member reason`
- `!تايم @member 10m reason`
- `!تحذير @member reason`
- `!قول @everyone maintenance starts now`
- `!dm @member message text`
- `!قيفواي 10m 1 Nitro`

## Persistence

SQLite uses WAL mode, foreign keys, and a busy timeout. Ticket numbering, ticket records, warnings, giveaway entries and states, maintenance settings, reminders, suggestions, applications, levels, invite counts, achievements, blocked words, transcripts, and action logs survive restarts. Reminder delivery is restored after restarts. Every non-bot message is counted for achievements; XP is awarded at most once per user every 60 seconds. Level-up announcements are posted automatically. Anti-swear removes matching messages and attempts a 15-minute timeout; bot permissions and role hierarchy still apply. Ticket transcripts include the latest 100 messages. Keep the `data/` directory on persistent storage and include it in your own backup policy.

## Community setup

Configure welcome, autorole, suggestions, applications, ticket category parents, and transcript delivery using the corresponding slash commands. Invite tracking requires Manage Server permission and can only attribute joins when the bot can compare invite usage. The word filter records a warning, deletes the message, attempts a 15-minute timeout, and sends a DM. Staff can review suggestions with `/suggestionreview` or `!مراجعة اقتراح`.

## Presence

The bot starts in Do Not Disturb and displays `Watching 𝓐𝓵𝓲 𝓐𝓵𝓰𝓱𝓪𝓶𝓭𝓲`.

## Validation

Run `npm run check` and `npm test`.
