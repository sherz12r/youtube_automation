/* eslint-disable @typescript-eslint/no-require-imports -- Passenger loads the startup file with CommonJS require(). */
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

process.env.STORY_DATABASE_PATH ??= join(__dirname, "data", "stories.sqlite");

// Passenger calls require() synchronously. Start the ESM server with import()
// after returning control to its loader, without top-level await in the entry.
import(pathToFileURL(join(__dirname, "dist", "standalone", "server.js")).href).catch(error => {
  console.error("[Noor Studio] Failed to start the application:", error);
  process.exitCode = 1;
});
