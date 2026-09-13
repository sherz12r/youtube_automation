/* eslint-disable @typescript-eslint/no-require-imports -- Exercise Passenger's CommonJS loading behavior. */
const { Server } = require("node:http");
const { resolve } = require("node:path");

// Like Passenger, intercept the application's listener. Use an OS-assigned
// local port so these tests never compete with a running development server.
const listen = Server.prototype.listen;
Server.prototype.listen = function () {
  this.once("listening", () => process.send({ port: this.address().port }));
  return listen.call(this, 0, "127.0.0.1");
};

require(resolve(process.argv[2]));
