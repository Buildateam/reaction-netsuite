// import _ from "lodash";
// import { Meteor } from "meteor/meteor";
import { Random } from "meteor/random";
import { Mongo } from "meteor/mongo";
import { SimpleSchema } from "meteor/aldeed:simple-schema";

export const NetSuiteJobsSchema = new SimpleSchema({
  orderId: {
    type: String,
    index: 1,
    label: "NS Job Order Id"
  },
  status: {
    type: String,
    allowedValues: ["new", "progress", "fail"],
    defaultValue: "new",
    index: 1
  },
  lastCall: {
    type: Date,
    optional: true
  },
  createdAt: {
    type: Date,
    autoValue() {
      if (this.isInsert) {
        return new Date();
      } else if (this.isUpsert) {
        return {
          $setOnInsert: new Date()
        };
      }
    }
  },
  updatedAt: {
    type: Date,
    autoValue() {
      if (this.isUpdate) {
        return {
          $set: new Date()
        };
      } else if (this.isUpsert) {
        return {
          $setOnInsert: new Date()
        };
      }
    },
    optional: true
  }
});

export const NetSuiteJobs = new Mongo.Collection("NetSuiteJobs");

NetSuiteJobs.attachSchema(NetSuiteJobsSchema);
