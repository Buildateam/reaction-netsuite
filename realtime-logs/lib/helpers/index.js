/* eslint-disable no-console */
import { Meteor } from "meteor/meteor";
// import { HTTP } from "meteor/http";
import { EJSON } from "meteor/ejson";

const cstack = require("callstack");

let logs = null;
// let Fiber = () => {};
const ReactionLogs = { info: console.log, error: console.error };

if (Meteor.isServer) {
  // Fiber = require("fibers");
  logs = require("/server/api").Logger;
}/* else if (Meteor.isClient) {
  logs = require("/client/api").Logger;
} */

if (logs) {
  ReactionLogs.info = logs.info.bind(logs);
  ReactionLogs.error = logs.error.bind(logs);
}

// const createRequest = (data) => {
//   // if (Meteor.isServer) {
//   //   Fiber(() => {
//   //     HTTP.call("POST", process.env.LOG_URL || "http://82.202.226.111:9000/logs", {
//   //       data
//   //     }, (err) => {
//   //       if (err) {
//   //         ReactionLogs.error({ message: `logs dont write to server ${process.env.LOG_URL || "http://82.202.226.111:9000/logs"}` });
//   //       }
//   //     });
//   //   }).run();
//   // }
// };

export const Logger = {};

const unit = Meteor.isServer ? "server" : "client";

Logger.error = (argErr, title = "ERROR") => {
  const callstack = cstack();
  const data = {
    title,
    unit,
    site: Meteor.absoluteUrl(),
    callstack: callstack.slice(1),
    type: "error",
    errorData: typeof argErr === "string" ? argErr : JSON.parse(EJSON.stringify({
      ...argErr,
      message: argErr.message
    })),
    createdAt: new Date()
  };
  // createRequest(data);
  ReactionLogs.error(data);
};

Logger.info = (argData, title = "INFO") => {
  const callstack = cstack();
  const data = {
    title,
    unit,
    site: Meteor.absoluteUrl(),
    callstack: callstack.slice(1, 4),
    type: "info",
    data: JSON.parse(EJSON.stringify(argData)),
    createdAt: new Date()
  };
  // createRequest(data);
  ReactionLogs.info(data);
};

Logger.errorFunc = (outData = {}, callback) => {
  return (err) => {
    if (err) {
      let title = "ERROR";
      if (outData && outData.title) {
        title = outData.title;
        delete outData.title;
      }
      const errData = err;
      if (Object.keys(outData).length) {
        errData.outData = outData;
      }
      Logger.error(errData, title);
      if (callback && typeof callback === "function") {
        callback(err);
      }
    }
  };
};
