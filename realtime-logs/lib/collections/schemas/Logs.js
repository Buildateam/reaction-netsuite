import { SimpleSchema } from "meteor/aldeed:simple-schema";
import { Mongo } from "meteor/mongo";

export const RealTimeLogs = new Mongo.Collection("RealTimeLogs");

RealTimeLogs.attachSchema(new SimpleSchema({
  whence: {
    type: String,
    allowedValues: [ "server", "client"],
    defaultValue: "server",
    index: true
  },
  type: {
    type: String,
    allowedValues: [ "error", "info", "warning"],
    defaultValue: "info",
    index: true
  },
  title: {
    type: String
  },
  data: {
    type: Object
  },
  createdAt: {
    type: Date,
    autoValue() {
      if (this.isInsert) {
        return new Date;
      } else if (this.isUpsert) {
        return {
          $setOnInsert: new Date
        };
      }
    }
  },
  updatedAt: {
    type: Date,
    autoValue() {
      if (this.isUpdate) {
        return {
          $set: new Date
        };
      } else if (this.isUpsert) {
        return {
          $setOnInsert: new Date
        };
      }
      return new Date;
    }
  }
}));
