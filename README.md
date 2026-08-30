# Noor Studio — YouTube Story Automation

Noor Studio is a review-first dashboard for producing Islamic story videos. It is designed around this workflow:

`Scheduled topic research → source verification → story script → human approval → voice → video → YouTube`

The religious verification and publishing steps intentionally require human approval. Approved stories can be narrated with OpenAI, rendered as downloadable browser-generated WebM videos, previewed, and optionally uploaded privately through the YouTube Data API. Provider-backed research and persistent server scheduling still need API integrations.

## Included

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
- Startup file: `dist/standalone/server.js`, when cPanel requires a JavaScript file

If the cPanel screen asks for a startup **file** instead of a command, use:

```text
dist/standalone/server.js
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
```

`OPENAI_API_KEY` enables narration and video creation. The three YouTube values enable the optional private-upload button; the refresh token must include the `youtube.upload` OAuth scope.

### 5. Updating the cPanel deployment

```bash
cd /home/CPANEL_USER/youtube_automation
git pull origin master
npm install
npm run build
```

Restart the Node.js application from cPanel after each deployment.

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
