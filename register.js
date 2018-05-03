/* eslint-disable quote-props */
import { Reaction } from "/server/api";

Reaction.registerPackage({
  label: "Netsuite",
  name: "netsuite-sync",
  icon: "fa fa-archive",
  autoEnable: true,
  settings: {
    email: "",
    password: "",
    account: "",
    role: "",
    applicationId: "",
    webservicesDomain: "https://webservices.sandbox.netsuite.com",
    errorEmails: "err@local,err2@local",
    paymentConfig: {
      "PaypalExpress": "Paypal",
      "MasterCard": "Master Card",
      "CreditCard": "Credit Card",
      "Visa": "VISA",
      "AmericanExpress": "American Express",
      "Discover": "Discover",
      "Affirm": "Affirm Payment"
    }
  },
  registry: [{
    provides: "settings",
    name: "settings/netsuite-sync",
    label: "Netsuite",
    description: "Configure Netsuite",
    icon: "fa fa-archive",
    template: "netsuiteSyncSettings"
  }]
});
