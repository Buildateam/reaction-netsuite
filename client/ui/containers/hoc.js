import React, {Component} from 'react';
import { registerComponent, composeWithTracker } from "/imports/plugins/core/components/lib";
import { Reaction } from "/client/api";
import { Packages } from "/lib/collections";
import UINetSuite from "../components/ui";

const composer = (props, onData) => {

  const subscription = Reaction.Subscriptions.Packages;

  const netsuiteSync = {
    name: "netsuite-sync",
    shopId: Reaction.getShopId()
  };

  if (subscription.ready()) {
    const netsuite = Packages.find(netsuiteSync);
    onData(null, { netsuite });
  };
}

registerComponent("netsuiteSyncSettings", UINetSuite, composeWithTracker(composer));
