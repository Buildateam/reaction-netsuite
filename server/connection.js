import { Reaction } from "server/api";
import { Packages } from "lib/collections";
import { Logger } from "imports/plugins/custom/realtime-logs";
import Fiber from "fibers";
import NetSuite from "netsuite-js";

const asyncLib = require("async");

let service = null;
let serviceClient = null;
let client = null;
// let createTime = Date.now() / 1000;

const q = asyncLib.queue(({ promise }, callback) => {
  promise()
    .then((result) => {
      return callback(null, result);
    })
    .catch((err) => {
      return callback(err);
    });
}, 1);

export const getSettings = () => {
  const data = Packages.findOne({
    name: "netsuite-sync",
    shopId: Reaction.getShopId()
  });
  return data ? data.settings : null;
};

export const initConfig = () => {
  let config = null;
  const credentials = getSettings();
  if (credentials) {
    config = new NetSuite.Configuration(credentials);
  }
  return config;
};

export const createService = (cb) => {
  Fiber(() => {
    const config = initConfig();
    if (config) {
      service = new NetSuite.Service(config);
      serviceClient = service.init(true)
        .then((argClient) => {
          // Logger.info({}, "netsuite complete init wsdl");
          cb(null, argClient);
        })
        .catch((err) => {
          Logger.error({ message: err.message }, "netsuite error init wsdl");
          cb(err, null);
        });
    }
  }).run();
};

const autoReCreateConnection = (delay) => {
  Fiber(() => {
    setInterval(() => {
      // eslint-disable-next-line no-use-before-define
      createService(callbackToCreateService);
    }, delay);
  }).run();
};

autoReCreateConnection(24 * 60 * 60 * 1000);

const autoCreateService = (delay, cb = () => {}) => {
  Fiber(() => {
    setTimeout(() => {
      createService((err, data) => {
        // eslint-disable-next-line no-use-before-define
        callbackToCreateService(err, data, cb);
      });
    }, delay);
  }).run();
};

const callbackToCreateService = (err, argClient, cb = () => {}) => {
  if (err) {
    autoCreateService(1000);
  } else {
    client = argClient;
    cb();
  }
};

export const getConnection = () => {
  return serviceClient;
};

export const getService = () => {
  return service;
};

export const getClient = () => {
  return client;
};

export const createRequest = (promise, cbData = o => o) => new Promise((resolve, reject) => {
  q.push([{ promise }], (err, o) => {
    if (err) {
      return reject(err);
    }
    return resolve(cbData(o));
  });
});

export const recreateConnection = (cb = () => {}) => {
  Logger.info({}, "CALL RECREATE NETSUITE CONNECTION");
  autoCreateService(0, cb);
  return null;
};
