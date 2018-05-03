import { SimpleSchema } from "meteor/aldeed:simple-schema";
import { PackageConfig } from "/lib/collections/schemas/registry";

export const NetSuiteConfig = new SimpleSchema([
  PackageConfig, {
    "settings.email": {
      type: String,
      label: "Email"
    },
    "settings.password": {
      type: String,
      label: "Password"
    },
    "settings.account": {
      type: String,
      label: "AccountId"
    },
    "settings.role": {
      type: String,
      label: "RoleId"
    },
    "settings.applicationId": {
      type: String,
      label: "AppId"
    },
    "settings.webservicesDomain": {
      type: String,
      label: "Webservices Domain"
    }
  }
]);
