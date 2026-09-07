import { fileURLToPath } from "node:url";
import { startProdServer } from "../../dist/standalone/node_modules/vinext/dist/server/prod-server.js";

const { server } = await startProdServer({
  port: 0,
  host: "127.0.0.1",
  outDir: fileURLToPath(new URL("../../dist/standalone/dist", import.meta.url)),
  silent: true,
});
process.send({ port: server.address().port });
