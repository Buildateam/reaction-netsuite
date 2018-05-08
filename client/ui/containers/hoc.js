import React, {Component} from 'react';
import { registerComponent, composeWithTracker } from "/imports/plugins/core/components/lib";
import { Reaction } from "/client/api";
import { Packages } from "/lib/collections";
import UINetSuite from "../components/ui";

const composer = (props, onData) => {

  const subscription = Reaction.Subscriptions.Packages;

  const netsuite = {
    name: "netsuite-sync",
    shopId: Reaction.getShopId()
  };

  if (subscription.ready()) {
    const packages = Packages.find(netsuite);
    onData(null, { packages });
  };
}

registerComponent("netsuiteSyncSettings", UINetSuite, composeWithTracker(composer));
