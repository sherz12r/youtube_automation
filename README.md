# Noor Studio — YouTube Story Automation

Noor Studio is a review-first dashboard for producing Islamic story videos. It is designed around this workflow:

`Scheduled topic research → source verification → story script → human approval → voice → video → YouTube`

The religious verification and publishing steps intentionally require human approval. Approved stories can be narrated with OpenAI, rendered as downloadable browser-generated WebM videos, previewed, and optionally uploaded privately through the YouTube Data API. Provider-backed research and persistent server scheduling still need API integrations.

## Included

Story creation currently selects from the bilingual draft library in `app/page.tsx`;
it does not call an AI story-generation provider. Each draft includes a spoken
introduction, the background needed for its selected narrative, chronological
transitions, and an ending. Musa's narrative follows his birth through the rescue
from Pharaoh, rather than claiming to cover his entire later life. The same text
is used for reading, sharing, narration, and video. Existing saved entries use
the current library text; previously rendered videos must be recreated to include
revised narration. Future provider integrations must apply
`prompts/islamic-youtube-story-writer.md`.

- Story research and review queue
- Qur'an, translation, and religious-claim verification indicators
- Full-story playback using the browser's speech engine
- Daily, weekly, or custom-day scheduling controls
- Timezone and automation pause controls
- Mandatory approval before video production
- In-browser narrated video creation, preview, and WebM download
- Optional private YouTube upload after video review
- Responsive desktop and mobile dashboard

Schedule preferences currently use browser storage. They remain on the same browser/device, but do not run when the application is offline. An always-on scheduler must be connected to a hosted worker, cron task, n8n, or Make workflow.

## Story database and device synchronization

Stories and their review/published statuses now live in a shared server database.
The cPanel Node application uses **SQLite**, through Node's built-in `node:sqlite`
module; no MySQL server, database password, or additional database package is
needed. The file defaults to `data/stories.sqlite` in the application directory.
`app.cjs` (also loaded by `app.js`) anchors this path to the project root. When using `npm start` or the
standalone server directly, the default is relative to the working directory;
set `STORY_DATABASE_PATH` to an absolute path to keep it stable across deployments.
The directory must be writable by the Node application and outside the public
web directory. Keep it outside `dist/`, which is replaced on each build, and
include it in server backups. Runtime database files are excluded from Git.

Previously, there was **no active story database**: the Drizzle schema was empty,
the Cloudflare D1 binding was disabled, and stories were written only to the
creating browser's `localStorage` (`noor-stories`). A phone therefore loaded its
own separate queue, regardless of how often it refreshed.

The page now loads `/api/stories` without caching, refreshes when a mobile tab
becomes visible or returns from browser history, and checks for updates every
30 seconds while visible. Creation and status changes are confirmed only after
the server saves them. Failed requests show a retry message.

After deploying this update, open the site once in **each original browser and
on the same domain where you created stories**. Existing browser stories are
automatically imported, retaining the old local copy as a backup. Imports add
missing stories without replacing the shared queue or rolling back statuses
already saved on the server. Then refresh the phone. Do not clear the original
browser's site data before importing it; the server cannot retrieve browser-only
stories from another device.

This is one shared studio per deployment, consistent with the existing app; it
does not create separate queues for separate user accounts. Video files remain
in the creating browser's IndexedDB, and schedule preferences remain device-local.
The existing Cloudflare/Sites build uses its `DB` D1 binding (SQLite-compatible)
instead of a local SQLite file; its migrations are in `drizzle/`.

## Requirements

- Node.js 22.13 or newer
- npm 10 or newer
- A modern browser

## Run locally

```bash
git clone https://github.com/sherz12r/youtube_automation.git
cd youtube_automation
npm install
npm run dev
```

Open the local address shown in the terminal, normally `http://localhost:3000`.

Create and test a production build:

```bash
npm run build
npm start
```

To use another port:

### macOS or Linux

```bash
PORT=8080 npm start
```

### Windows PowerShell

```powershell
$env:PORT=8080
npm start
```

## Deploy on cPanel with Application Manager

Your hosting account must provide **Software > Application Manager**, Passenger,
and Node.js **22.13 or newer**. Ask the hosting provider to install or select
Node.js 22 if Application Manager is using an older runtime. PHP-only hosting
cannot run this project.

These instructions use a dedicated domain or subdomain with `/` as the base URL.
The application files and SQLite database stay outside `public_html`; Passenger
connects the selected domain to the Node.js application.

### 1. Upload the project

Use **Files > Git Version Control** to clone:

```text
https://github.com/sherz12r/youtube_automation.git
```

Select the `master` branch. Alternatively, upload and extract a ZIP outside
`public_html`, for example into:

```text
/home/CPANEL_USER/youtube_automation
```

Replace `CPANEL_USER` in every command and path below with the actual cPanel
account username.

### 2. Install dependencies and build

Open **Advanced > Terminal** (or connect with SSH) and run:

```bash
cd /home/CPANEL_USER/youtube_automation
npm install
npm run build
mkdir -p data tmp
test -f dist/standalone/server.js
```

If `node --version` is not Node 22, use the host's cPanel Node.js binary. A
typical cPanel path is `/opt/cpanel/ea-nodejs22/bin`:

```bash
export PATH=/opt/cpanel/ea-nodejs22/bin:$PATH
node --version
npm install
npm run build
```

Do not use `npm install --omit=dev` before building because the build tools are
development dependencies. The final `test` command should return silently; an
error means the production build was not created.

### 3. Register the application

Open **Software > Application Manager**, click **Register Application**, and use:

- **Application Name:** `noor-studio`
- **Deployment Domain:** the domain or subdomain that will serve the app
- **Base Application URL:** `/`
- **Application Path:** `youtube_automation` (relative to the cPanel home directory)
- **Deployment Environment:** `Production`

Add the environment variables from the next section, then click **Deploy**.
Application Manager uses the newest Node.js runtime configured by the hosting
provider; it does not provide the same per-application version selector found in
some cPanel Node.js interfaces.

Passenger looks for `app.js` by default. This repository already includes
`app.js`, which loads the Passenger-compatible `app.cjs` wrapper and then the
built server. Do not enter `npm start`, set a startup file, or rename either
wrapper when using Application Manager. Passenger supplies the listening port,
so do not add a `PORT` environment variable.

After registration, Application Manager may show **Enable Dependencies**. It can
install the npm packages, but `npm run build` must still be run from Terminal as
shown above.

### 4. Add environment variables

In Application Manager, edit `noor-studio` and select **Add Variable** for each
value. At minimum, set an absolute database path:

```text
STORY_DATABASE_PATH=/home/CPANEL_USER/youtube_automation/data/stories.sqlite
```

Add provider secrets only for the features being used:

```text
OPENAI_API_KEY=
ELEVENLABS_API_KEY=
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_REFRESH_TOKEN=
YOUTUBE_API_KEY=
```

Keep secrets in cPanel only; never add them to GitHub or commit them. The three
YouTube OAuth values enable uploads, and the refresh token must include the
`youtube.upload` scope. `YOUTUBE_API_KEY` enables related-video discovery for
description and tag enrichment. Without it, discovery falls back to OAuth and
keeps the original metadata if the token lacks a read scope.

Save the variables and deploy the application again. If Application Manager does
not show environment-variable controls, ask the hosting provider to enable the
Apache `mod_env` module.

### 5. Restart and verify

Passenger restarts an Application Manager app when this file is created or its
timestamp changes:

```bash
cd /home/CPANEL_USER/youtube_automation
mkdir -p tmp
touch tmp/restart.txt
```

Open the deployment domain over HTTPS and create a test story. The first story
request creates the SQLite table automatically. Confirm that
`data/stories.sqlite` exists and keep the entire `data/` directory in server
backups. Do not put the database in `dist/`, because that directory is replaced
by each build.

After deploying the shared-database update, open the site once in each original
browser on the original domain before clearing browser data. This imports any
stories that were previously stored only in that browser.

### 6. Update the deployment

```bash
cd /home/CPANEL_USER/youtube_automation
git pull origin master
npm install
npm run build
mkdir -p tmp
touch tmp/restart.txt
```

Keep `data/` in place during every update. If dependencies did not change,
`npm install` can be skipped.

### Troubleshooting

- Check `/home/CPANEL_USER/youtube_automation/logs/` for Passenger errors.
- A missing `dist/standalone/server.js` means `npm run build` did not complete.
- `ERR_REQUIRE_ASYNC_MODULE` or `ERR_REQUIRE_ESM` usually means the server has old
  wrappers or is running an unsupported Node.js version. Pull the latest code,
  confirm `node --version` is at least `22.13`, rebuild, and touch
  `tmp/restart.txt`.
- A database-open error usually means `STORY_DATABASE_PATH` is incorrect or the
  application user cannot write to `data/`.
- If **Software > Application Manager** is missing, the hosting provider must
  enable Application Manager and Passenger for the account.

See cPanel's official
[Application Manager documentation](https://docs.cpanel.net/cpanel/software/application-manager/)
and [Node.js installation guide](https://docs.cpanel.net/knowledge-base/web-services/how-to-install-a-node.js-application/)
for host-level requirements and Passenger details.

### Urdu and English speech

The Listen buttons generate audio on the server, so visitors do not need Urdu or
English system voices installed on their devices. Long scripts are split into
provider-safe narration chunks and returned as one complete audio file. Add
`OPENAI_API_KEY` in **Software > Application Manager**, save the change, and
restart the application by touching `tmp/restart.txt`.

## Scheduled production workflow

All provider-backed story writing must follow
[`prompts/islamic-youtube-story-writer.md`](prompts/islamic-youtube-story-writer.md).
That specification is the canonical prompt for accuracy, sourcing, Islamic adab,
Urdu narration, titles, thumbnails, descriptions, and output structure. The
current starter stories are bundled drafts; a future research/writing provider
must load this prompt instead of duplicating or weakening its rules in code.

For real unattended scheduling, configure a cPanel cron job or an external workflow service to call a protected backend endpoint. The recommended production behavior is:

1. Scheduler requests a new story draft.
2. The backend searches only approved source collections.
3. The draft and citations are saved as **Needs review**.
4. A human reviews the wording and references.
5. Approval unlocks narrated video rendering in the browser.
6. The finished video can be previewed and downloaded.
7. The reviewer can optionally upload it privately to YouTube.

Never place ChatGPT, ElevenLabs, or YouTube secrets in browser-side code.

## Useful commands

```bash
npm run dev       # local development
npm run build     # production build
npm start         # production server
npm run lint      # code checks
npm test          # production build and story persistence/sync regression tests
npm run test:stories # reuse an existing build for the regression tests
```

## Technology

- React 19
- vinext / Vite
- TypeScript
- Cloudflare-compatible server output

## Safety note

AI-generated religious content can contain incorrect wording, attribution, or authenticity claims. Keep an approved source library and require a qualified reviewer before publishing.


### htaccess
```
RewriteEngine On

RewriteCond %{REQUEST_FILENAME} -f
RewriteRule ^ - [L]
```
