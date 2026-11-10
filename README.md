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
4. In the Discord Developer Portal, enable **Message Content Intent**. It is required for Arabic `!` prefix commands. The bot does not request the Guild Members privileged intent.
5. Invite the bot to the configured server with the `bot` and `applications.commands` OAuth scopes.
6. Give its role the permissions required by the features you intend to use: View Channels, Send Messages, Read Message History, Embed Links, Attach Files, Manage Channels, Manage Messages, Manage Roles, Ban Members, Kick Members, Moderate Members, View Audit Log, and (if you want live @everyone/@here notifications) Mention Everyone. Keep the bot role above roles it must assign or moderate.
7. Start it with `npm start`.

Slash commands are registered automatically to the configured server after the bot becomes ready. The bot does not register global commands.

## Commands

Slash commands use English names without underscores. Prefix commands use `!` and Arabic names; the prefix is fixed in code.

- Moderation: `/ban`, `/unban`, `/kick`, `/timeout`, `/untimeout`, `/warn`, `/warnings`, `/clearwarn`, `/clear`
- Tickets: `/ticket`, `/close`, `/reopen`, `/delete`, `/add`, `/remove`, `/claim`
- Giveaways: `/giveaway`, `/giveawaylist`, `/endgiveaway`, `/reroll`
- Utility: `/say`, `/dm`, `/role`, `/removerole`, `/help`, `/userinfo`, `/serverinfo`, `/ping`, `/logs`

Equivalent Arabic prefix commands are shown by `!مساعدة` and `/help`.

Examples:
- `!حظر @member reason`
- `!تايم @member 10m reason`
- `!تحذير @member reason`
- `!قول @everyone maintenance starts now`
- `!dm @member message text`
- `!قيفواي 10m 1 Nitro`

## Persistence

SQLite uses WAL mode, foreign keys, and a busy timeout. Ticket numbering, ticket records, warnings, giveaway entries and states, and action logs survive restarts. Keep the `data/` directory on persistent storage and include it in your own backup policy.

## Presence

The bot starts in Do Not Disturb and displays `Watching 𝓐𝓵𝓲 𝓐𝓵𝓰𝓱𝓪𝓶𝓭𝓲`.

## Validation

Run `npm run check` and `npm test`.
