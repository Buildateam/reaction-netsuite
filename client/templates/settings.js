/* eslint-disable semi,no-console */
import { Template } from "meteor/templating";
import { Reaction } from "/client/api";
import { Packages } from "/lib/collections";
import { Meteor } from "meteor/meteor";
import { NetSuiteConfig } from "../../lib/collections/schemas";

Template.netsuiteSyncSettings.helpers({
  NetSuiteConfigPackageConfig() {
    return NetSuiteConfig;
  },
  packageData() {
    return Packages.findOne({
      name: "netsuite-sync",
      shopId: Reaction.getShopId()
    });
  },
  onSubmit() {
    Meteor.call("recreateNetsuiteConnection");
  }
});
