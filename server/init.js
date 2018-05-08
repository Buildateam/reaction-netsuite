/* eslint-disable no-console */

import { Hooks, Logger } from "/server/api";
import { Jobs, Orders } from "/lib/collections";
import Fiber from "fibers";
import NetSuite from "netsuite-js";
import { createRequest, recreateConnection, getService } from "./connection";
import { OrderAfterCreateNetsuiteSync} from "./meteorMethods";
import { registerSchema } from "@reactioncommerce/schemas";
import SimpleSchema from "simpl-schema";
import { NetSuiteJobs } from "./collection";
import {Meteor} from "meteor/meteor";
import { Job } from "/imports/plugins/core/job-collection/lib";

function sessionTimeline() {
  Fiber(() => setInterval(() => {
    Fiber(() => {
      const nsJobOrder = NetSuiteJobs.findOne({
        status: { $in: ["progress", "new"] }
      });
      if (!nsJobOrder) {
        const service = getService();
        if (service) {
          const search = new NetSuite.Search.EmployeeSearchBasic();
          const searchField = new NetSuite.Search.Fields.SearchStringField();
          searchField.field = "firstName";
          searchField.operator = "contains";
          searchField.searchValue = "DefaultSearch";
          search.searchFields.push(searchField);
          try {
            createRequest(() => {
              return service.search(search)
                .then((result) => {
                  if (!result.searchResult.status.$attributes.isSuccess) {
                    console.log("DefaultSearch:", result.searchResult.status.$attributes.isSuccess);
                    console.log(result.searchResult.status);
                  }
                })
                .catch((e) => {
                  console.error("DefaultSearch:", e);
                });
            });
          } catch (err) {
            recreateConnection();
          }
        } else {
          recreateConnection();
          console.log("DefaultSearch: not init service");
        }
      }
    }).run();
  }, 1000 * 60 * 5)).run();
}

function jobProcess() {
  Jobs.processJobs(
    "netsuite/orderInsert",
    {
      pollInterval: 1000,
      workTimeout: 2 * 180 * 1000
    },
    async (job, callback) => {
      try {
        let isNext = false;
        let nsJobOrder = NetSuiteJobs.findOne({
          status: "progress"
        });
        if (nsJobOrder) {
          if (((new Date().getTime() - nsJobOrder.lastCall.getTime()) / 1000) > 30) {
            const order = Orders.findOne({ _id: nsJobOrder.orderId });

            if (order) {
              if (!order.isExportedToNetsuite) {
                NetSuiteJobs.update(
                  { _id: nsJobOrder._id },
                  {
                    $set: {
                      lastCall: new Date()
                    }
                  }
                );
                OrderAfterCreateNetsuiteSync( order._id, err);
                //Meteor.call("OrderAfterCreateNetsuiteSync", order._id, (err) => Logger.error(err));
              } else {
                NetSuiteJobs.remove({
                  orderId: nsJobOrder.orderId
                });
                isNext = true;
              }
            } else {
              NetSuiteJobs.remove({
                orderId: order._id
              });
            }
          }
        } else {
          isNext = true;
        }
        if (isNext) {
          nsJobOrder = NetSuiteJobs.findOne({
            status: "new"
          });
          if (!nsJobOrder) {
            nsJobOrder = NetSuiteJobs.findOne({
              status: "fail"
            });
          }
          if (nsJobOrder) {
            NetSuiteJobs.update(
              { _id: nsJobOrder._id },
              {
                $set: {
                  status: "progress",
                  lastCall: new Date()
                }
              }
            );
            OrderAfterCreateNetsuiteSync( order._id, err);
            //Meteor.call("OrderAfterCreateNetsuiteSync", nsJobOrder.orderId, (err) => Logger.error(err));
          }
        }
        const jobId = job && job._doc && job._doc._id ? job._doc._id : null;
        job.done({}, { repeatId: true }, (err, newId) => {
          if (err) {
            Logger.info(`job.done error(${err.message}) -> new jobId(${newId})`);
            job.fail({ message: "job:done - fail status" });
          }
          Jobs.remove({ _id: jobId });
        });
        callback();
      } catch (error) {
        Logger.error(error);
        callback();
      }
    }
  );
}

function extendOrderSchema() {
  Logger.info("::: Add netsuite fields to order schema");

  const ExtendedSchema = new SimpleSchema({
    isExportedToNetsuite: {
      type: Boolean,
      optional: true,
      index: true,
      defaultValue: false
    },
    netsuiteOrderId: {
      type: String,
      optional: true,
      index: true,
      defaultValue: "none"
    },
    exportedErrors: {
      type: Array,
      optional: true,
      defaultValue: []
    },
    "exportedErrors.$": {
      type: String
    }
  });

  Orders.attachSchema(ExtendedSchema);
  registerSchema("Order", ExtendedSchema);
}

function orderJob() {

   Jobs.remove({
     type: "netsuite/orderInsert"
   });
  return new Job(Jobs, "netsuite/orderInsert", {})
     .priority("normal")
     .retry({ retries: Jobs.forever, wait: 1000 })
     .repeat({ repeats: Jobs.forever, wait: 1000 })
     .save();
}

Hooks.Events.add("afterOrderInsert", (userId, doc) => {
  NetSuiteJobs.insert({
    orderId: doc._id
  });
});

Hooks.Events.add("afterCoreInit", () => {
  extendOrderSchema();

  recreateConnection(() => {
      Fiber(() => {
       // eslint-disable-next-line semi
          console.log("connection ns success");
          orderJob();
          jobProcess();
          sessionTimeline();
      }).run();
  });
});
