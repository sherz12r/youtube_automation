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
`app.js` anchors this path to the project root. When using `npm start` or the
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

## Deploy on cPanel

Your cPanel account must include **Setup Node.js App** or **Application Manager**, support Node.js 22+, and allow long-running Node applications. PHP-only shared hosting cannot run this project.

### 1. Upload the project

Use cPanel Git Version Control to clone:

```text
https://github.com/sherz12r/youtube_automation.git
```

Select the `master` branch. Alternatively, upload and extract a ZIP outside `public_html`, for example into:

```text
/home/CPANEL_USER/youtube_automation
```

### 2. Create the Node application

In **Setup Node.js App**:

- Node.js version: `22` or the newest available version
- Application mode: `Production`
- Application root: `youtube_automation`
- Application URL: your chosen domain or subdomain
- Startup command: `npm start`, when your host supports npm start commands
- Startup file: `app.js`, when cPanel requires a JavaScript file

If the cPanel screen asks for a startup **file** instead of a command, use:

```text
app.js
```

The production server automatically reads cPanel's `PORT` environment variable and listens on `0.0.0.0`.

### 3. Install and build

Open cPanel Terminal, enter the application directory, and run:

```bash
cd /home/CPANEL_USER/youtube_automation
npm install
npm run build
```

Do not use `npm install --omit=dev` before building because the build tools are development dependencies. After a successful build, restart the application from cPanel.

### 4. Environment variables

Add secrets in the cPanel Node.js application environment panel—never commit them to Git. Future integrations are expected to use variables such as:

```text
OPENAI_API_KEY=
ELEVENLABS_API_KEY=
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_REFRESH_TOKEN=
STORY_DATABASE_PATH=/home/CPANEL_USER/youtube_automation/data/stories.sqlite
```

`OPENAI_API_KEY` enables narration and video creation. The three YouTube OAuth values enable uploading; the refresh token must include the `youtube.upload` OAuth scope. Add `YOUTUBE_API_KEY` to let the uploader search recent, high-view related public videos and automatically enrich descriptions and tags with recurring relevant phrases. Without an API key, discovery falls back to OAuth and gracefully keeps the original metadata if the token lacks a read scope.

### 5. Updating the cPanel deployment

```bash
cd /home/CPANEL_USER/youtube_automation
git pull origin master
npm install
npm run build
```

Restart the Node.js application from cPanel after each deployment.

For this storage update, use Node.js **22.13 or newer**, set the absolute
`STORY_DATABASE_PATH` above using your actual cPanel username, and select `app.js`
as the startup file. The table is created automatically on the first story
request. Refresh the original desktop browser to import its old stories before
refreshing the mobile browser. Keep the `data/` directory when updating the code.

### Urdu and English speech

The Listen buttons generate audio on the server, so visitors do not need
Urdu or English system voices installed on their devices. Long scripts are
split into provider-safe narration chunks and returned as one complete audio
file, so the app does not impose a story-length cap. Add the following
environment variable in cPanel's **Setup Node.js App** screen:

```text
OPENAI_API_KEY=your_api_key
```

Keep this value in cPanel only. Do not add it to GitHub or commit it to the
repository. Restart the Node.js application after adding or changing it.

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
