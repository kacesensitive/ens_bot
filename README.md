# Twitch Raffle System

A raffle system built into the main Twitch bot (`bot.ts`) that awards tickets for subscriptions and gift subs, with a companion Discord bot for checking entries and generating wheel spinner files.

## How It Works

- The **main Twitch bot** (`bot.ts`) collects tickets automatically and handles all in-chat raffle commands.
- The **Discord bot** (`discord-raffle.ts`) is a read/admin front-end over the same database — it does not collect tickets itself, so it's safe to run alongside the main bot.
- Ticket data is stored in Supabase (`raffle_users` table), shared by both bots and persistent across restarts.

## Configuration

Create a `.env` file in the root directory:

```
USERNAME=your_bot_username
OAUTH=oauth:your_oauth_token
CHANNEL=your_channel_name
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
DISCORD_BOT_TOKEN=your_discord_bot_token
```

For the Discord bot token:

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application, then add a bot under the Bot section
3. Copy the token into your `.env` file
4. Under "Bot Permissions" enable "Send Messages", "Embed Links", and "Attach Files"
5. Under "Privileged Gateway Intents" enable "Message Content Intent"
6. Use the OAuth2 URL Generator (with 'bot' scope) to generate an invite link for your server

## Running

```bash
yarn start          # main bot — chat commands + automatic ticket collection
yarn discord-raffle # optional — Discord commands + wheel file generation
```

> **Note:** The raffle only runs while the main bot is active. If someone runs
> `!deactivate`, no tickets are awarded and raffle commands won't respond until
> `!activate`.

## Earning Tickets

Tickets accumulate automatically — no opt-in needed:

| Action | Tickets |
| --- | --- |
| Subscribe | 1 |
| Resub | 1 |
| Gift a sub | 1 per sub gifted (a 5-sub mystery gift = 5 tickets) |

Anonymous gifters get nothing (there's no one to credit).

## Twitch Chat Commands

### Viewer Commands

- **!checktickets** — check how many raffle tickets you have
- **!toptickets** — see the top 5 ticket holders
- **!rafflehelp** — display available raffle commands

### Moderator Commands

- **!giveticket @username [amount]** — manually give tickets (default: 1)
- **!drawwinner** — draw a random winner weighted by ticket count; the winner is announced in chat and **one ticket is deducted** from them, so you can run it repeatedly for multiple prizes
- **!resetraffle** — reset all raffle tickets to zero (no undo — draw your winners first)

## Discord Commands

All commands work only in the designated raffle channel; `give` and `reset` also require the Manage Messages permission.

- **!raffle check** — display all raffle entries with ticket counts
- **!raffle wheel** — generate a `.wheel` file from current entries
- **!raffle wheel-example** — show an example wheel format file
- **!raffle wheel-customize** — generate a customized wheel (see below)
- **!raffle draw** — draw a winner (removes 1 ticket from them)
- **!raffle give <username> <tickets>** — give tickets to a user
- **!raffle reset** — reset all raffle tickets
- **!raffle help** — display available commands

### Wheel Customization Options

- **!raffle wheel-customize title "My Custom Wheel"** — set wheel title
- **!raffle wheel-customize sound on/off** — enable/disable winning sound
- **!raffle wheel-customize confetti on/off** — enable/disable confetti
- **!raffle wheel-customize spintime 15** — set spin time in seconds (1–30)

**Note:** The wheel background is always green (#33FF33) for chroma keying.

## Wheel Format Files

`!raffle wheel` produces a `.wheel` file compatible with wheel spinner tools (e.g. wheelofnames.com — Open/Import the file there). The file contains:

- All entries with proper ticket weighting (each entry's weight equals its ticket count, so more tickets = proportionally bigger slice without duplicate entries)
- A green background (#33FF33) for chroma keying in streaming software
- Customizable appearance, sound, and animation settings

Users with 0 tickets are excluded automatically.

## A Typical Raffle Night

1. Let tickets build up over the stream(s) — subs and gifts do it automatically, `!giveticket` for anything special.
2. Hype it up with `!toptickets` so people see the leaderboard.
3. When it's time: `!raffle wheel` in Discord, import the file into your wheel spinner, and spin on stream — or just `!drawwinner` in chat for a quick draw.
4. `!resetraffle` when the event is over to start fresh.

## Legacy

`raffle-bot.ts` is the old standalone raffle bot (`yarn raffle`). Its functionality now lives in `bot.ts` — **don't run it alongside the main bot** or subs will earn double tickets.
