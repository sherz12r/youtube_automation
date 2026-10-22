# Noor Studio — Multi-tenant YouTube Automation

Noor Studio is a subscription-based SaaS workspace for producing YouTube videos. A main administrator creates customer accounts and controls access, while every customer receives an isolated channel workspace, story queue, generated-video library, channel profile, and encrypted YouTube authorization.

The default profile supports sourced Islamic stories, but each customer can configure their own channel topic, audience, language, tone, publishing schedule, and upload privacy.

`Scheduled topic research → source verification → story script → human approval → voice → video → YouTube`

Religious verification and publishing intentionally require human approval. Approved stories can be narrated with OpenAI, rendered as downloadable browser-generated WebM videos, previewed, and optionally uploaded privately through the YouTube Data API.

## Included

- Public product landing page and secure email/password login
- Main-admin customer and subscription management
- Opaque, HttpOnly database-backed sessions
- Seven-character minimum password policy (200-character maximum)
- Per-customer channel topics, audience, language, tone, schedule, and upload privacy
- Encrypted per-customer YouTube refresh tokens
- Server-enforced tenant isolation for stories, videos, settings, and upload sessions
- Shared server-only OpenAI key and provider configuration
- Story research, bilingual script generation, and a human-review queue
- Optional 30–60 second, source-checked Prophet stories for YouTube Shorts
- Quran, translation, and religious-claim verification indicators
- Server-generated Urdu and English narration
- In-browser narrated-video creation, preview, and WebM download
- Optional private YouTube upload after video review
- Responsive desktop and mobile dashboards

## Accounts, isolation, and storage

Accounts, sessions, subscriptions, channel profiles, and story statuses live in one server database. Every customer-owned query is scoped by the authenticated owner's ID. API authorization, database queries, video metadata, file paths, and YouTube upload sessions all enforce that boundary; changing a record ID does not allow one customer to access another customer's data.

YouTube refresh tokens are encrypted at rest with `YOUTUBE_TOKEN_ENCRYPTION_KEY`. The OpenAI key and Google OAuth client credentials remain server-only and shared by the platform. Each customer stores only their own YouTube refresh token.

The cPanel Node application uses SQLite through Node's built-in `node:sqlite` module, so no separate MySQL server is required. The database defaults to `data/stories.sqlite`. Generated videos default to `data/videos`. Keep the entire `data/` directory outside `dist/`, writable by the Node application, and included in server backups.

The Cloudflare/Sites build uses the configured `DB` D1 binding instead of a local SQLite file. Database migrations are in `drizzle/`.

Story data is loaded from the server without caching and refreshed when a browser tab becomes visible, returns from browser history, and periodically while visible. Legacy stories previously held only in browser storage are imported without replacing the customer's server queue or rolling back newer statuses.

Schedule preferences remain device-local and do not execute while the application is offline. Use a hosted worker, cPanel cron task, n8n, Make, or another scheduler for unattended production.

## Requirements

- Node.js 22.13 or newer
- npm 10 or newer
- A modern browser

## Run locally

```bash
git clone https://github.com/sherz12r/youtube_automation.git
cd youtube_automation
npm install
```

Copy `.env.example` to `.env.local`, provide at least the administrator and encryption values, then start development:

```bash
npm run dev
```

The local address is normally `http://localhost:3000`.

Create and run a production build:

```bash
npm run build
npm start
```

To use another port on macOS or Linux:

```bash
PORT=8080 npm start
```

On Windows PowerShell:

```powershell
$env:PORT=8080
npm start
```

## Environment variables

The minimum platform configuration is:

```text
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=use-a-unique-password-of-at-least-7-characters
ADMIN_NAME=Main administrator
YOUTUBE_TOKEN_ENCRYPTION_KEY=use-a-long-random-secret-and-keep-it-stable
STORY_DATABASE_PATH=./data/stories.sqlite
VIDEO_STORAGE_PATH=./data/videos
YOUTUBE_UPLOAD_SESSION_PATH=./data/youtube-uploads
```

Provider configuration:

```text
OPENAI_API_KEY=
OPENAI_STORY_MODEL=gpt-6-astra
OPENAI_IMAGE_MODEL=gpt-image-2.5-flare
OPENAI_IMAGE_QUALITY=low
ELEVENLABS_API_KEY=
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_OAUTH_REDIRECT_URI=https://your-domain.example/api/youtube/oauth/callback
# Optional compatibility token for the main administrator only. Customer tokens belong in Channel settings.
YOUTUBE_REFRESH_TOKEN=
YOUTUBE_API_KEY=
YOUTUBE_REGION_CODE=US
```

Keep all secrets in server environment variables; never expose or commit them. `ADMIN_EMAIL` and `ADMIN_PASSWORD` seed the first main administrator. Do not change `YOUTUBE_TOKEN_ENCRYPTION_KEY` after customers connect YouTube, because existing tokens could no longer be decrypted.

The shared YouTube client ID and secret enable OAuth. Add `https://your-domain.example/api/youtube/oauth/callback` to the Google OAuth client's authorized redirect URIs and set the same URL in `YOUTUBE_OAUTH_REDIRECT_URI`. Each customer then uses **Connect YouTube** in Channel settings; the resulting refresh token is encrypted and belongs only to that account. An optional `YOUTUBE_REFRESH_TOKEN` is accepted only for the main administrator, which keeps older single-account installations working without exposing that token to customer accounts. `YOUTUBE_API_KEY` enables public related-video research without an additional OAuth read scope. `YOUTUBE_REGION_CODE` defaults to `PK` for Urdu and `US` for English.

## Deploy on cPanel with Application Manager

The hosting account must provide **Software > Application Manager**, Passenger, and Node.js 22.13 or newer. PHP-only hosting cannot run this project.

These instructions assume a dedicated domain or subdomain with `/` as the base URL. Keep the application and SQLite database outside `public_html`; Passenger connects the selected domain to the Node application.

### 1. Upload the project

Use **Files > Git Version Control** to clone:

```text
https://github.com/sherz12r/youtube_automation.git
```

Select the `master` branch. Alternatively, upload and extract the project outside `public_html`, for example:

```text
/home/CPANEL_USER/youtube_automation
```

Replace `CPANEL_USER` below with the real cPanel username.

### 2. Install and build

Open **Advanced > Terminal** or connect through SSH:

```bash
cd /home/CPANEL_USER/youtube_automation
npm install
npm run build
mkdir -p data tmp
test -f dist/standalone/server.js
```

If the default runtime is older, use the host's Node 22 binary. A common cPanel path is:

```bash
export PATH=/opt/cpanel/ea-nodejs22/bin:$PATH
node --version
npm install
npm run build
```

Do not use `npm install --omit=dev` before building because build tools are development dependencies.

### 3. Register the application

In **Software > Application Manager**, select **Register Application** and use:

- **Application Name:** `noor-studio`
- **Deployment Domain:** the domain or subdomain serving the app
- **Base Application URL:** `/`
- **Application Path:** `youtube_automation`
- **Deployment Environment:** `Production`

Passenger looks for `app.js` by default. This repository's `app.js` loads the Passenger-compatible `app.cjs` wrapper and the built server. Do not rename these files or add a separate `PORT` environment variable; Passenger supplies the listening port.

### 4. Configure production variables

In Application Manager, add at least:

```text
STORY_DATABASE_PATH=/home/CPANEL_USER/youtube_automation/data/stories.sqlite
VIDEO_STORAGE_PATH=/home/CPANEL_USER/youtube_automation/data/videos
YOUTUBE_UPLOAD_SESSION_PATH=/home/CPANEL_USER/youtube_automation/data/youtube-uploads
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=use-a-unique-password-of-at-least-7-characters
ADMIN_NAME=Main administrator
YOUTUBE_TOKEN_ENCRYPTION_KEY=use-a-long-random-secret-and-keep-it-stable
```

Add provider variables only for the features you use. Save the variables and deploy again. If Application Manager does not expose environment-variable controls, ask the host to enable Apache `mod_env`.

### 5. Restart and verify

Passenger restarts the app when `tmp/restart.txt` changes:

```bash
cd /home/CPANEL_USER/youtube_automation
mkdir -p tmp
touch tmp/restart.txt
```

Open the site over HTTPS and sign in with the administrator account. Create a customer from **Customers**, sign in as that customer, save the channel profile, and create a test story. Confirm that `data/stories.sqlite` exists and back up the entire `data/` directory.

### 6. Update the deployment

```bash
cd /home/CPANEL_USER/youtube_automation
git pull origin master
npm install
npm run build
mkdir -p tmp
touch tmp/restart.txt
```

Keep `data/` in place during updates. If dependencies did not change, `npm install` can be skipped.

### Troubleshooting

- Check `/home/CPANEL_USER/youtube_automation/logs/` and `logs/startup.log` for Passenger errors.
- A missing `dist/standalone/server.js` means `npm run build` did not complete.
- `ERR_REQUIRE_ASYNC_MODULE` or `ERR_REQUIRE_ESM` usually means the server has old wrappers or an unsupported Node version. Pull the latest code, verify Node 22.13+, rebuild, and touch `tmp/restart.txt`.
- A database-open error usually means `STORY_DATABASE_PATH` is incorrect or the application user cannot write to `data/`.
- If **Software > Application Manager** is missing, the host must enable Application Manager and Passenger.

See cPanel's [Application Manager documentation](https://docs.cpanel.net/cpanel/software/application-manager/) and [Node.js installation guide](https://docs.cpanel.net/knowledge-base/web-services/how-to-install-a-node.js-application/) for host-level requirements.

## Media generation

The Listen controls generate audio on the server, so visitors do not need Urdu or English system voices installed. Long scripts are split into provider-safe narration chunks and returned as one complete audio file.

Video creation requires `OPENAI_API_KEY` and generates six story-specific 16:9 frames before recording. The renderer uses `OPENAI_IMAGE_MODEL=gpt-image-2.5-flare` and `OPENAI_IMAGE_QUALITY=low` by default. If image generation fails, video creation stops and displays the provider error instead of silently publishing a fallback.

## Scheduled production workflow

Provider-backed Islamic story writing follows [`prompts/islamic-youtube-story-writer.md`](prompts/islamic-youtube-story-writer.md). The generator applies the relevant content rules, excludes titles already in the signed-in customer's queue, rejects duplicate or summary-length output, and saves complete Urdu and English scripts with source notes.

Recommended production behavior:

1. The scheduler requests a new story draft.
2. The backend searches approved source collections.
3. The draft and citations are saved as **Needs review**.
4. A human reviews the wording and references.
5. Approval unlocks narrated-video rendering.
6. The finished video is previewed and downloaded.
7. The reviewer can optionally upload it privately to YouTube.

Never place OpenAI, ElevenLabs, or YouTube secrets in browser-side code.

## Useful commands

```bash
npm run dev          # local development
npm run build        # production build
npm start            # production server
npm run lint         # code checks
npm test             # build plus regression suite
npm run test:stories # run regressions against an existing build
```

## Technology

- React 19
- vinext / Vite
- TypeScript
- SQLite / Cloudflare D1
- Cloudflare-compatible server output

## Safety note

AI-generated religious content can contain incorrect wording, attribution, or authenticity claims. Keep an approved source library and require a qualified reviewer before publishing.

### `.htaccess`

```apache
RewriteEngine On

RewriteCond %{REQUEST_FILENAME} -f
RewriteRule ^ - [L]
```
