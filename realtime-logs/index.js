export * from "./lib/helpers";
import { Migrations } from "meteor/percolate:migrations";
import { Meteor } from "meteor/meteor";
import { Logger } from "./lib/helpers";

if (Meteor.isServer) {
  const Fiber = require("fibers");
  Fiber(() => {

    process.on("exit", (code) => {
      Logger.error({ code }, "exit");
    });

    process.on("uncaughtException", (err) => {
      Logger.error(err, "uncaughtException");
    });

    process.on("unhandledRejection", (reason, p) => {
      Logger.error({ reason, p }, "unhandledRejection");
    });

    process.on("rejectionHandled", (p) => {
      Logger.error(p, "rejectionHandled");
    });

    process.on("unhandledRejection", (reason, p) => {
      Logger.error({ reason, p }, "unhandledRejection");
    });

    process.on("warning", (warning) => {
      Logger.error(warning, "warning");
    });

    const handle = signal => {
      Logger.error({
        signal,
        process: true
      }, `Process:${signal}`);
    };

    process.on("SIGINT", () => handle("SIGINT"));
    process.on("SIGTERM", () => handle("SIGTERM"));
  }).run();
}
