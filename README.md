# Spaceship

A Telegram bot and admin panel that let your broker partner clients into a private **Discord server** and/or a private **Telegram channel**.

- **Brokers:** Elefin (by email) and XM (by MT5 account ID). Each can be turned on or off.
- **Checks:** the client must be under your partner link and meet your join requirements.
- **Questionnaire:** before anything else, users can be asked for their name and a phone number confirmed through Telegram Gateway.
- **Admin panel (Spaceship):** members, kicks and bans, inactivity cleanup, incidents, stats and every setting.

One Node.js process runs the Telegram bot, the Discord connection and the admin panel.

## How it works

1. **Questionnaire** (if on). The user starts the bot and is asked:
   - Their **full name**.
   - Their **phone number**, shared with one tap or typed with the country code. [Telegram Gateway](https://gateway.telegram.org) sends a 6-digit code as a Telegram message, and the user types it back.
2. **Pick a broker.** The bot offers only the brokers that are turned on, then asks for the account:
   - **Elefin:** the email they registered with.
   - **XM:** their MT5 account ID.
3. **Check.** The bot asks that broker's partner API:
   - **Not under your partner link:** the bot shows that broker's sign-up link.
   - **Requirements not met:** the bot lists what passed and what didn't, with the user's own numbers.
   - **Passed:** the bot sends a personal join link for each place that's turned on.
4. **Join.**
   - **Discord server:** the user logs in with Discord and the bot adds them. Their Discord account is linked to their broker account.
   - **Telegram channel:** the user requests to join with their personal link. The bot approves verified users only, so a forwarded link is useless to anyone else.

Each broker account and Discord account can be linked to only one Telegram user.

## Requirements

- **Node.js 20.11+**
- **MySQL 8** (or compatible)
- **A Telegram bot** from [@BotFather](https://t.me/BotFather)
- **A public HTTPS address** for this server, if you use Discord (Discord sends users back to it after login). In production, a domain behind a reverse proxy. For testing, a tunnel such as ngrok or Cloudflare Tunnel.
- **Optional:**
  - A Discord application with a bot
  - A private Telegram channel
  - An XM partners API token
  - A Telegram Gateway token

## Install

```bash
npm install
```

```bash
cp .env.example .env
```

`.env` holds only what the app needs to start:

| Variable | What it is |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Token from @BotFather |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | MySQL connection |
| `WEB_PORT` | Port for the admin panel and the Discord callback (default `3000`) |
| `ADMIN_SESSION_SECRET` | Long random string that signs admin sessions. Changing it signs every admin out |

Everything else (broker tokens, Discord, channel, Gateway token, requirements) is set in the admin panel and stored in the database.

## Run

Development (hot reload for the admin panel; restart for bot changes):

```bash
npm run dev
```

Production:

```bash
npm run build
```

```bash
npm start
```

Open `http://localhost:<WEB_PORT>/admin`. Tables are created and updated automatically on every start. To run only the migration:

```bash
npm run migrate
```

## First-time setup

1. **Create the super admin.** While no admins exist, `/admin` offers to create the first account. Do this right after deploying.
2. **Brokers:**
   - **Elefin:** API token, API base URL, referral link and join requirements.
   - **XM:** turn it on, then add the API token, sign-up link and join requirements.
   - Use **Test connection** on each one.
3. **Settings:**
   - **Start questionnaire:** on or off, plus the Telegram Gateway token.
   - **Telegram bot:** limits (join link lifetime, checks per hour).
4. **Discord Server** (optional): turn it on, paste the bot token, server ID and client secret from the [Discord Developer Portal](https://discord.com/developers/applications), and set the Public URL.
5. **Telegram Channel** (optional): turn it on, click **Add bot to your channel**, then pick the channel from the list.
6. **Setup & status:** checks every connection live and links straight to whatever needs fixing.

### Discord checklist

- **Bot → Server Members Intent:** on. The Setup page can turn it on for you.
- **OAuth2 → Redirects:** add `<Public URL>/discord/callback`. The Setup page shows the exact URL.
- **Invite the bot:** it needs *Create Instant Invite*, *Kick Members* and *Ban Members*, plus *Manage Roles* if you use a member role. The Setup page has a button with these selected.
- **Role order:** keep the bot's role above your members' roles.

### Telegram channel checklist

- **Make the channel private** (no public @username).
- **Make the bot an admin** with *Invite users via link* and *Ban users*.

## Brokers

| | Elefin | XM |
|---|---|---|
| **User sends** | Email | MT5 account ID |
| **Partner link check** | Client found under your partner account | `GET /traders/{id}`, and `validated` must be true |
| **Join requirements** | Min deposit, min balance, min lots, min trades, last trade within N days (each optional) | Min lots in the last N days (up to 365), not archived, balance above XM's threshold (each optional) |
| **Inactivity cleanup** | Downloads the full client list (200 per page) | Asks for each member's trades (50 accounts and 93 days per request), and optionally balance |

Turning a broker off stops new verifications with it. People already verified with it keep their access until you remove them.

## Admin panel

| Page | What it's for |
|---|---|
| **Dashboard** | Member counts, new and verified users, joins, funnel, verification results, and per-broker stats (verified, joined, checks, pass rate, verified per day) |
| **Members** | One row per person who came through the bot: name, phone, Telegram, Discord, channel status and broker account. Search, filter (including by broker), CSV export, and kick / ban / allow rejoin |
| **Incidents** | Problems the bot ran into (API errors, users who weren't affiliated or didn't qualify, failed joins and so on), to resolve or ignore. Repeats are counted instead of duplicated |
| **Inactivity cleanup** | Pick a broker, find members with no trades in the last N days, review the list, and kick them from both places at once |
| **Brokers** | Elefin and XM: on/off, API access, sign-up links, join requirements and connection test |
| **Settings** | Start questionnaire and bot limits |
| **Discord Server** | On/off, credentials and Public URL |
| **Telegram Channel** | On/off and channel selection |
| **Setup & status** | Live checks with one-click fixes |
| **Admins** | Admin accounts and permissions (super admins only) |

### Kick, ban and rejoin

- **Kick:** removes the person from the Discord server and/or the channel and tells them on Telegram. Their verification is reset, so they can rejoin by verifying again if they still qualify.
- **Ban:** removes them, and blocks them everywhere until an admin clicks **Allow rejoin**.
- **On Telegram,** a kick is a ban followed by an immediate unban.

### Admin roles

| Role | Can |
|---|---|
| **Super admin** | Everything, including managing admins |
| **Read-only** | See every page, change nothing |
| **Custom** | See everything, plus any of the permissions below |

Custom permissions:
- Kick, ban and allow members
- Resolve incidents
- Bulk-remove inactive members
- Edit brokers
- Edit settings
- Edit Discord server settings
- Edit Telegram channel settings

Rules:
- **Every change is checked on the server.**
- **Own account:** admins can change their own password, but not their own role.
- **Super admins:** there is always at least one.
- **Sign-out:** changing an admin's password, or deleting them, signs them out at once.

## Project layout

```
server.js        Entry point: web server, Telegram bot, Discord gateway
app/             Next.js admin panel: pages and API routes
components/      Admin panel UI
lib/             Admin auth, permissions, brokers, incident types, helpers
src/bot/         Telegram bot flow and messages
src/services/    Elefin, XM, Telegram Gateway, Discord, Telegram channel, incidents, setup checks
src/db/          MySQL pool, schema (auto-migrated), queries
src/web/         Discord login callback
```

## Database

Tables are declared in `src/db/schema.js` and created or extended on start; existing columns are never dropped. No sample data is inserted. Only default settings and join requirements are added, and the requirements start switched off.

| Table | Holds |
|---|---|
| `admins` | Admin accounts (scrypt-hashed passwords) and permissions |
| `settings` | Every panel setting |
| `conditions` | Elefin join requirements |
| `tg_users` | Telegram users: name and verified phone, broker, Elefin email or XM account, linked Discord account |
| `verification_logs` | Every account check, with the broker's data at the time |
| `elefin_clients` | Elefin client list from the last cleanup sync |
| `discord_oauth_states` | One-time "Login with Discord" links |
| `discord_members` | Discord server members and their status |
| `channel_members` | Telegram channel members and their status |
| `bot_chats` | Channels the bot was added to |
| `incidents` | Problems for admins to review |

## Security

- **`.env` is git-ignored.** Keep it that way.
- **Passwords and sessions:** admin passwords are salted scrypt hashes, and sessions are signed with `ADMIN_SESSION_SECRET`.
- **Write-only tokens:** the Elefin, XM and Telegram Gateway tokens are never sent back to the browser.
- **Visible credentials:** Discord credentials are visible to signed-in admins, so hand out admin accounts carefully.
- **Use HTTPS in production.** Login cookies are marked `Secure` automatically over HTTPS.
