/* eslint-disable semi,no-console */
import { Template } from "meteor/templating";
import { Reaction } from "/client/api";
import { Packages } from "/lib/collections";
import { Meteor } from "meteor/meteor";
import { NetSuiteConfig } from "../../lib/collections/schemas";


// console.log('+++++++', Packages, Packages.findOne({
//                                                 name: "netsuite-sync",
//                                                 shopId: Reaction.getShopId()
//                                     }));



Template.netsuiteSyncSettings.helpers({
  NetSuiteConfigPackageConfig() {
    return NetSuiteConfig;
  },
  packageData() {
    const packages = Packages.findOne({
      name: "netsuite-sync",
      shopId: Reaction.getShopId()
    });

    console.log('---', packages, NetSuiteConfig.schema());

    return packages[0];
  },
  onSubmit() {
    Meteor.call("recreateNetsuiteConnection");
  }
});

//
// console.log('Reaction.getShopId()', Packages.findOne({
//   shopId: Reaction.getShopId()
// }));

//
// Template.netsuiteSyncSettings.helpers({
//   NetSuiteConfigPackageConfig() {
//     return NetSuiteConfig;
//   },
//   packageData() {
//     return Packages.findOne({
//       name: "netsuite-sync",
//       shopId: Reaction.getShopId()
//     });
//   },
//   onSubmit() {
//     Meteor.call("recreateNetsuiteConnection");
//   }
// });
