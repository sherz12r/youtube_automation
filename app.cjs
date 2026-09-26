/* eslint-disable @typescript-eslint/no-require-imports -- Passenger loads the startup file with CommonJS require(). */
const { appendFileSync, existsSync, mkdirSync } = require("node:fs");
const { dirname, join } = require("node:path");
const { pathToFileURL } = require("node:url");

process.env.STORY_DATABASE_PATH ??= join(__dirname, "data", "stories.sqlite");

const logDirectory = join(__dirname, "logs");
const startupLog = join(logDirectory, "startup.log");
const serverFile = join(__dirname, "dist", "standalone", "server.js");

function errorDetails(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause instanceof Error ? error.cause.message : error.cause,
    };
  }

  return { value: String(error) };
}

function logStartup(event, details = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    event,
    pid: process.pid,
    ...details,
  };

  // Passenger normally sends stderr to its application log. Keep a separate
  // file too so shared-hosting users can diagnose startup without WHM access.
  console.error(`[Noor Studio] ${event}`, details);
  try {
    mkdirSync(logDirectory, { recursive: true });
    appendFileSync(startupLog, `${JSON.stringify(entry)}\n`, "utf8");
  } catch (logError) {
    console.error("[Noor Studio] Could not write logs/startup.log", logError);
  }
}

logStartup("passenger-bootstrap", {
  nodeVersion: process.version,
  nodeExecutable: process.execPath,
  platform: `${process.platform}/${process.arch}`,
  workingDirectory: process.cwd(),
  applicationRoot: __dirname,
  startupFile: __filename,
  serverFile,
  serverFileExists: existsSync(serverFile),
  environment: process.env.NODE_ENV || null,
  passengerPortProvided: Boolean(process.env.PORT),
  sqliteBuiltinAvailable: Boolean(process.getBuiltinModule?.("node:sqlite")),
  databasePath: process.env.STORY_DATABASE_PATH,
  databaseDirectory: dirname(process.env.STORY_DATABASE_PATH),
});

process.on("uncaughtExceptionMonitor", (error, origin) => {
  logStartup("uncaught-exception", { origin, error: errorDetails(error) });
});

process.on("exit", code => {
  logStartup("process-exit", { code });
});

// Passenger calls require() synchronously. Start the ESM server with import()
// after returning control to its loader, without top-level await in the entry.
if (!existsSync(serverFile)) {
  const error = new Error(`Production server is missing: ${serverFile}. Run npm run build before starting Passenger.`);
  logStartup("bootstrap-failed", { error: errorDetails(error) });
  process.exitCode = 1;
} else {
  import(pathToFileURL(serverFile).href)
    .then(() => logStartup("server-module-imported"))
    .catch(error => {
      logStartup("bootstrap-failed", { error: errorDetails(error) });
      process.exitCode = 1;
    });
}
