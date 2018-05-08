import { PackageConfig } from "/lib/collections/schemas/registry";

//
// const NetSuiteConfigCustom = new SimpleSchema(
//      {
//       "settings.email": {
//         type: String,
//         label: "Email"
//       },
//       "settings.password": {
//         type: String,
//         label: "Password"
//       },
//       "settings.account": {
//         type: String,
//         label: "AccountId"
//       },
//       "settings.role": {
//         type: String,
//         label: "RoleId"

export const NetSuiteConfig = PackageConfig.extend({
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
});





// export const NetSuiteConfig = NetSuiteConfigCustom.extend(PackageConfig);

// export const NetSuiteConfig = new SimpleSchema([
//   PackageConfig, {
//     "settings.email": {
//       type: String,
//       label: "Email"
//     },
//     "settings.password": {
//       type: String,
//       label: "Password"
//     },
//     "settings.account": {
//       type: String,
//       label: "AccountId"
//     },
//     "settings.role": {
//       type: String,
//       label: "RoleId"
//     },
//     "settings.applicationId": {
//       type: String,
//       label: "AppId"
//     },
//     "settings.webservicesDomain": {
//       type: String,
//       label: "Webservices Domain"
//     }
//   }
// ]
// );
