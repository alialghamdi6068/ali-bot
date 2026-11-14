# Ali Bot

A personal, single-server Discord management bot built with Node.js, Discord.js, and SQLite.

## Requirements

- Node.js 22.12 or newer
- A Discord application and bot
- Persistent host storage for `data/ali-bot.sqlite`

## Setup

1. Run `npm install`.
2. Copy `.env.example` to `.env`.
3. Set `DISCORD_TOKEN` and `GUILD_ID` only.
4. Enable **Message Content Intent** and **Server Members Intent** in the Discord Developer Portal. Message Content is required for Arabic prefix commands; Server Members is required for member lookups and moderation.
5. Invite the bot with the `bot` and `applications.commands` scopes.
6. Grant only the permissions needed for the systems you enable: View Channels, Send Messages, Read Message History, Embed Links, Attach Files, Manage Channels, Manage Messages, Manage Roles, Ban Members, Kick Members, Moderate Members, and View Audit Log for staff using `/logs`.
7. Start with `npm start`.

Slash commands are registered to the configured server on startup. The bot is restricted to the configured `GUILD_ID`.

## Systems

- **Moderation:** ban, unban, kick, timeout, untimeout, warnings, warning removal, and message cleanup.
- **Tickets:** support tickets, categories, close confirmation/cancel, reopen, staff-only delete, member access, claim, transcripts, and persistent numbering.
- **Logs:** persistent moderation, ticket, giveaway, and administrative action logs, viewable with `/logs`.
- **Security and permissions:** permission checks, actor/bot role hierarchy validation, and single-server restrictions.
- **Roles:** safe role assignment and removal with hierarchy checks.
- **Messages:** send bot messages, direct messages, and announcement embeds.
- **Server tools:** channel lock/unlock and slowmode.
- **Information:** user/server information, latency, and command help.
- **Giveaways:** create, enter, list, end, and reroll, with persistent state.
- **Database:** SQLite with WAL, foreign keys, and busy timeout; ticket counters, warnings, giveaways, settings, transcripts, and logs persist across restarts.

## Commands

Slash command names are English. Prefix commands use Arabic with `!`. Use `/help` or `!مساعدة` for the current command list.

Examples:
- `!حظر @member reason`
- `!تايم @member 10m reason`
- `!تحذير @member reason`
- `!تكت`
- `!إغلاق تكت`
- `!فتح تكت`
- `!قول message`
- `!dm @member message`
- `!قيفواي 10m 1 prize`
- `!لوق`

## Presence

The bot starts in Do Not Disturb and displays `Watching 𝓐𝓵𝓲 𝓐𝓵𝓰𝓱𝓪𝓶𝓭𝓲`.

## Validation

Run `npm run check` and `npm test`.
