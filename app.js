// Phusion Passenger uses app.js as the default Node.js startup file.
// The standalone Vinext server reads Passenger's PORT environment variable.
import { fileURLToPath } from "node:url";

process.env.STORY_DATABASE_PATH ??= fileURLToPath(new URL("./data/stories.sqlite", import.meta.url));
await import("./dist/standalone/server.js");
