/* eslint-disable brace-style */
import _ from "lodash";
import find from "lodash/find";
import moment from "moment/moment";
import NetSuite from "netsuite-js";
import accounting from "accounting-js";
import { Reaction } from "/server/api";
import { SSR } from "meteor/meteorhacks:ssr";
import { Meteor } from "meteor/meteor";
import { Logger } from "/server/api";
import { check } from "meteor/check";
import { NetSuiteJobs } from "./collection";
import { Shipping, Accounts, Orders, Media, Shops } from "/lib/collections";
import { getService, createRequest, recreateConnection, getSettings } from "./connection";

const Promise = require("bluebird");

const updateNSOrderJob = (orderId, isOK) => {
  check(orderId, String);
  check(isOK, Boolean);
  if (isOK) {
    NetSuiteJobs.remove({
      orderId
    });
  } else {
    NetSuiteJobs.update({
      orderId
    }, {
      $set: {
        status: "fail",
        lastCall: new Date()
      }
    });
  }
};

const sendErrorMail = async (errors, orderId) => {
  if (errors && Array.isArray(errors) && errors.length && orderId) {
    try {
      Logger.error(errors, "error sync order in to netsuite");
      const order = Orders.findOne({ _id: orderId });
      const customerInfo = await getCustomerInfo(order.userId, order.email, order._id);
      if (customerInfo) {
        customerInfo.name = `${customerInfo.firstName || "NULL"} ${customerInfo.lastName || "NULL"}`;
      }
      const shop = Shops.findOne(order.shopId);
      const emailLogo = Meteor.absoluteUrl() + "resources/email-templates/shop-logo.png";
      let dataForEmail = {};

      let subtotal = 0;
      let shippingCost = 0;
      let taxes = 0;
      let discounts = 0;
      let amount = 0;
      let address = {};
      let paymentMethod = {};
      let shippingAddress = {};
      let tracking;
      let carrier = "";

      for (const billingRecord of order.billing) {
        subtotal += Number.parseFloat(billingRecord.invoice.subtotal);
        taxes += Number.parseFloat(billingRecord.invoice.taxes);
        discounts += Number.parseFloat(billingRecord.invoice.discounts);
        amount += billingRecord.paymentMethod.amount;
        address = billingRecord.address;
        paymentMethod = billingRecord.paymentMethod;
      }
      for (const shippingRecord of order.shipping) {
        shippingAddress = shippingRecord.address;
        carrier = shippingRecord.shipmentMethod.carrier;
        tracking = shippingRecord.tracking;
        shippingCost += shippingRecord.shipmentMethod.rate;
      }
      const refundResult = Meteor.call("orders/refunds/list", order);
      const refundTotal = Array.isArray(refundResult) && refundResult.reduce((acc, refund) => acc + refund.amount, 0);
      const userCurrencyFormatting = _.omit(shop.currencies[order.billing[0].currency.userCurrency], ["enabled", "rate"]);
      const userCurrencyExchangeRate = order.billing[0].currency.exchangeRate;
      const combinedItems = [];
      if (order) {
        for (const orderItem of order.items) {
          const foundItem = combinedItems.find((combinedItem) => {
            if (combinedItem.variants) {
              return combinedItem.variants._id === orderItem.variants._id;
            }
            return false;
          });
          if (foundItem) {
            foundItem.quantity++;
          } else {
            orderItem.variants.displayPrice = accounting.formatMoney(orderItem.variants.price * userCurrencyExchangeRate, userCurrencyFormatting);
            orderItem.sku = orderItem.variants.sku || orderItem.product.sku;
            combinedItems.push(orderItem);
            orderItem.placeholderImage = Meteor.absoluteUrl() + "resources/placeholder.gif";
            const variantImage = Media.findOne({
              "metadata.productId": orderItem.productId,
              "metadata.variantId": orderItem.variants._id
            });
            if (variantImage) {
              orderItem.variantImage = Meteor.absoluteUrl(variantImage.url());
            }
            const productImage = Media.findOne({ "metadata.productId": orderItem.productId });
            if (productImage) {
              orderItem.productImage = Meteor.absoluteUrl(productImage.url());
            }
          }
        }
        dataForEmail = {
          shop,
          contactEmail: shop.emails[0].address,
          homepage: Meteor.absoluteUrl(),
          emailLogo,
          copyrightDate: moment().format("YYYY"),
          legalName: _.get(shop, "addressBook[0].company"),
          physicalAddress: {
            address: `${_.get(shop, "addressBook[0].address1")} ${_.get(shop, "addressBook[0].address2")}`,
            city: _.get(shop, "addressBook[0].city"),
            region: _.get(shop, "addressBook[0].region"),
            postal: _.get(shop, "addressBook[0].postal")
          },
          shopName: shop.name,
          order,
          user: customerInfo,
          billing: {
            address: {
              address: address.address1,
              city: address.city,
              region: address.region,
              postal: address.postal
            },
            paymentMethod: paymentMethod.storedCard || paymentMethod.processor,
            subtotal: accounting.formatMoney(subtotal * userCurrencyExchangeRate, userCurrencyFormatting),
            shipping: accounting.formatMoney(shippingCost * userCurrencyExchangeRate, userCurrencyFormatting),
            taxes: accounting.formatMoney(taxes * userCurrencyExchangeRate, userCurrencyFormatting),
            discounts: accounting.formatMoney(discounts * userCurrencyExchangeRate, userCurrencyFormatting),
            refunds: accounting.formatMoney(refundTotal * userCurrencyExchangeRate, userCurrencyFormatting),
            total: accounting.formatMoney((subtotal + shippingCost + taxes - discounts) * userCurrencyExchangeRate, userCurrencyFormatting),
            adjustedTotal: accounting.formatMoney((amount - refundTotal) * userCurrencyExchangeRate, userCurrencyFormatting)
          },
          combinedItems,
          orderDate: moment(order.createdAt).format("MM/DD/YYYY"),
          orderUrl: `cart/completed?_id=${order.cartId}`,
          orderId: order.humanFriendlyId || order._id,
          shipping: {
            tracking,
            carrier,
            address: {
              address: shippingAddress.address1,
              city: shippingAddress.city,
              region: shippingAddress.region,
              postal: shippingAddress.postal
            }
          }
        };
      }
      dataForEmail.errors = errors;
      const tpl = "orders/ErrorOrder";
      const subject = "orders/ErrorOrder/subject";
      SSR.compileTemplate(tpl, Reaction.Email.getTemplate(tpl));
      SSR.compileTemplate(subject, Reaction.Email.getSubject(tpl));
      const dstEmails = [];
      if (process.env.IS_LOCAL_HOST) {
        dstEmails.push(Reaction.getShopEmail());
      } else {
        const settings = getSettings();
        if (settings && typeof settings.errorEmails === "string") {
          const validateEmail = (email) => {
            const re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
            return re.test(String(email).toLowerCase());
          };
          const arrEmails = settings.errorEmails.split(",");
          if (Array.isArray(arrEmails)) {
            _.each(arrEmails, email => {
              if (typeof email === "string" && validateEmail(email)) {
                dstEmails.push(email);
              }
            });
          }
          // dstEmails.push("alexandr@buildateam.io");
        }
      }
      _.each(dstEmails, to => {
        const sendRes = Reaction.Email.send({
          to,
          from: Reaction.getShopEmail(),
          subject: SSR.render(subject, dataForEmail),
          html: SSR.render(tpl, dataForEmail)
        });
        console.log({
          sendRes,
          to
        });
      });
      return true;
    } catch (err) {
      Logger.error(err);
    }
  } else {
    Logger.info({
      orderId
    }, "ADD ORDER - OK");
  }
};

/* <Items> */
const getItemsFromNetsuite = async (orderId) => {
  check(orderId, String);
  try {
    const order = await Orders.findOne({ _id: orderId });
    const items = [];
    _.each(order.items, item => {
      items.push({
        quantity: item.quantity,
        key: item.variants.sku,
        amount: item.variants.price * item.quantity,
        rate: item.variants.price,
        tax: item.variants.taxable ? item.taxData ? item.taxData.rate : 0 : 0
      });
    });
    const searchItems = new NetSuite.Search.Fields.SearchStringField();
    const result = await createRequest(() => searchItems.getItemListFromSku(items.map((item) => item.key)));
    _.each(result, (item) => {
      const index = _.findIndex(items, (o) => {
        return o.key === item.key;
      });
      if (index !== -1) {
        items[index].value = item.value;
      }
    });
    const insertItems = [];
    const errorItems = [];
    _.each(items, (item) => {
      if (item.value) {
        const recordRef = new NetSuite.Records.RecordRef();
        const attrs = item.value.$attributes;
        recordRef.internalId = attrs.internalId;
        const salesOrderItem = new NetSuite.Sales.SalesOrderItem();
        // salesOrderItem.deferRevRec = true;
        // salesOrderItem.isEstimate = true;
        // salesOrderItem.itemIsFulfilled = false;
        // salesOrderItem.excludeFromRateRequest = true;
        // salesOrderItem.fromJob = false;
        // salesOrderItem.isClosed = false;
        // salesOrderItem.isEstimate = true;
        // salesOrderItem.noAutoAssignLocation = true;
        salesOrderItem.item = recordRef;
        // salesOrderItem.quantityBackOrdered = item.quantity;
        salesOrderItem.quantity = item.quantity;
        if (attrs["xsi:type"] && !new RegExp("ItemGroup", "i").test(attrs["xsi:type"])) {
          // salesOrderItem.amount = item.amount;
          salesOrderItem.rate = item.rate;
          salesOrderItem.expandItemGroup = false;
          // salesOrderItem.commitInventory = "_availableQty";
          salesOrderItem.isTaxable = item.value.isTaxable;
          salesOrderItem.taxAmount = item.value.isTaxable ? (item.amount / 100 * item.tax).toFixed(2) : 0;
          salesOrderItem.tax1Amt = salesOrderItem.taxAmount;
          // salesOrderItem.taxRate1 = item.tax;
          salesOrderItem.taxRate2 = item.tax;
        } else {
          salesOrderItem.expandItemGroup = true;
        }
        // salesOrderItem.price = item.rate;
        // salesOrderItem.commitInventory = "_availableQty";
        insertItems.push(salesOrderItem);
      } else {
        errorItems.push(item.key);
      }
    });
    return {
      insertItems,
      errorItems
    };
  } catch (err) {
    Logger.error(err.message, "getItemsFromNetsuite");
    return [];
  }
};

const createAddressObject = (addr) => {
  try {
    const address = new NetSuite.Common.Address();
    _.each([
      { reaction: "address1", netsuite: "addr1" },
      { reaction: "address2", netsuite: "addr2" },
      { reaction: "fullName", netsuite: "addressee" },
      { reaction: "phone", netsuite: "addrPhone" },
      { reaction: "attention", netsuite: "attention" },
      { reaction: "city", netsuite: "city" },
      { reaction: "country", netsuite: "country", cb: NetSuite.Heplers.getCountryString },
      { reaction: "region", netsuite: "state" },
      { reaction: "postal", netsuite: "zip " }
    ], (keys) => {
      if (addr[keys.reaction]) {
        let value = addr[keys.reaction];
        if (keys.cb) {
          value = keys.cb(value);
        }
        address[keys.netsuite] = value;
      }
    });
    return address;
  } catch (err) {
    Logger.error(err.message, "createAddressObject");
    return null;
  }
};
/* </items> */
/* <shipping> */
const getBillingAddr = async (order) => {
  try {
    if (order.billing.length && order.billing[0].address) {
      return createAddressObject(order.billing[0].address);
    }
    return null;
  } catch (err) {
    Logger.error(err.message, "getBillingAddr");
    return null;
  }
};

const getShippingAddr = async (order) => {
  try {
    if (order.shipping.length && order.shipping[0].address) {
      return createAddressObject(order.shipping[0].address);
    }
    return null;
  } catch (err) {
    Logger.error(err.message, "getShipipngAddr");
    return null;
  }
};

const getShippingList = async () => {
  try {
    const shippingList = await getService().getSelectValue(null);
    if (
      shippingList.getSelectValueResult
      && shippingList.getSelectValueResult.status
      && shippingList.getSelectValueResult.status.$attributes
      && shippingList.getSelectValueResult.status.$attributes.isSuccess
    ) {
      return _.filter(_.map(shippingList.getSelectValueResult.baseRefList.baseRef, o => {
        if (o.$attributes) {
          return {
            internalId: o.$attributes.internalId,
            name: o.name
          };
        }
        return null;
      }), el => el !== null);
    }
    return [];
  } catch (err) {
    Logger.error(err.message, "getShippingList");
    return [];
  }
};

const getDbShippingMethod =  (shippingId) => {
  const shipping = Shipping.findOne({
    $or: [
      { "methods._id": shippingId },
      { _id: shippingId },
      { "provider._id": shippingId }
    ]
  });
  const fRet = (obj) => ({
    name: obj.name,
    label: obj.label || obj.name,
    _id: obj._id
  });
  if (shipping) {
    if (shipping._id === shippingId) {
      return fRet(shipping);
    }
    const method = _.find(shipping.methods, o => o._id === shippingId);
    if (method) {
      return fRet(shipping);
    }
    const provider = _.find(shipping.provider, o => o._id === shippingId);
    if (provider) {
      return fRet(provider);
    }
  }
  return null;
};

const getReactionShippingMethod = (shippingData) => {
  if (shippingData) {
    const { shipmentQuotes, shipmentMethod } = shippingData;
    if (shipmentQuotes && shipmentMethod) {
      let findQuoteMethod = null;
      if (shipmentMethod._id) {
        if (shipmentQuotes.length) {
          findQuoteMethod = find(shipmentQuotes, o => o.method && o.method._id === shipmentMethod._id);
        } else {
          findQuoteMethod = getDbShippingMethod(shipmentMethod._id);
        }
      }
      if (findQuoteMethod) {
        return findQuoteMethod;
      }
    }
  }
  return null;
};

const findAssociatedStringShippingMethod = (method) => {
  const shippingAssociatedArray = [{
    netsuiteName: "DHL Express International",
    reactionsMethods: [{
      carrierName: "DHL EXPRESS",
      methodName: "Express International"
    }, {
      carrierName: "DHL",
      methodName: "Express International"
    }, {
      carrierName: "DHLE",
      methodName: "Express International"
    }]
  }, {
    netsuiteName: "First Class",
    reactionsMethods: [{
      carrierName: "Flat Rate",
      methodName: "First Class"
    }]
  }, {
    netsuiteName: "Free Shipping",
    reactionsMethods: [{
      carrierName: "Flat Rate",
      methodName: "Free Shipping"
    }]
  }, {
    netsuiteName: "Freight Shipping",
    reactionsMethods: [{
      carrierName: "Flat Rate",
      methodName: "Freight Shipping"
    }]
  }, {
    netsuiteName: "No Shipping - Walk In Customer",
    reactionsMethods: [{
      carrierName: "Flat Rate",
      methodName: "No Shipping - Walk In Customer"
    }]
  }, {
    netsuiteName: "UPS 2nd Day Air®",
    reactionsMethods: [{
      carrierName: "UPS",
      methodName: "Second Day Air®"
    }]
  }, {
    netsuiteName: "UPS 3 Day Select®",
    reactionsMethods: [{
      carrierName: "UPS",
      methodName: "3 Day Select®"
    }, {
      carrierName: "UPS",
      methodName: "3rd Day Select®"
    }, {
      carrierName: "UPS",
      methodName: "Third Day Select®"
    }, {
      carrierName: "UPS",
      methodName: "The Third Day Select®"
    }, {
      carrierName: "UPS",
      methodName: "3rd Day Select"
    }, {
      carrierName: "UPS",
      methodName: "Third Day Select"
    }, {
      carrierName: "UPS",
      methodName: "The Third Day Select"
    }]
  }, {
    netsuiteName: "UPS Next Day Air Early A.M.®",
    reactionsMethods: [{
      carrierName: "UPS",
      methodName: "Next Day Air Early A.M.®"
    }]
  }, {
    netsuiteName: "UPS Next Day Air Saver®",
    reactionsMethods: [{
      carrierName: "UPS",
      methodName: "Next Day Air Saver®"
    }]
  }, {
    netsuiteName: "UPS Next Day Air®",
    reactionsMethods: [{
      carrierName: "UPS",
      methodName: "Next Day Air®"
    }]
  }, {
    netsuiteName: "UPS Surepost Lightweight",
    reactionsMethods: [{
      carrierName: "UPS",
      methodName: "Surepost Lightweight"
    }, {
      carrierName: "UPS",
      methodName: "Surepost"
    }]
  }, {
    netsuiteName: "UPS Worldwide Expedited®",
    reactionsMethods: [{
      carrierName: "UPS",
      methodName: "Worldwide Expedited®"
    }, {
      carrierName: "UPS",
      methodName: "Worldwide Expedited"
    }]
  }, {
    netsuiteName: "UPS Worldwide Express®",
    reactionsMethods: [{
      carrierName: "UPS",
      methodName: "Worldwide Express®"
    }, {
      carrierName: "UPS",
      methodName: "Worldwide Express"
    }]
  }, {
    netsuiteName: "UPS® Ground",
    reactionsMethods: [{
      carrierName: "UPS",
      methodName: "Ground"
    }]
  }, {
    netsuiteName: "UPS® Standard",
    reactionsMethods: [{
      carrierName: "UPS",
      methodName: "Standard"
    }]
  }, {
    netsuiteName: "USPS First Class Mail",
    reactionsMethods: [{
      carrierName: "USPS",
      methodName: "First Class Mail"
    }]
  }, {
    netsuiteName: "USPS First Class Package International Service",
    reactionsMethods: [{
      carrierName: "USPS",
      methodName: "First Class Package International Service"
    }]
  }, {
    netsuiteName: "USPS First-Class Package/Mail Parcel",
    reactionsMethods: [{
      carrierName: "USPS",
      methodName: "First-Class Package/Mail Parcel"
    }]
  }, {
    netsuiteName: "USPS Parcel Select",
    reactionsMethods: [{
      carrierName: "USPS",
      methodName: "Parcel Select"
    }]
  }, {
    netsuiteName: "USPS Priority Mail Express",
    reactionsMethods: [{
      carrierName: "USPS",
      methodName: "Priority Mail Express"
    }]
  }, {
    netsuiteName: "USPS Priority Mail International",
    reactionsMethods: [{
      carrierName: "USPS",
      methodName: "Priority Mail International"
    }]
  }, {
    netsuiteName: "USPS Priority Mail Express International",
    reactionsMethods: [{
      carrierName: "USPS",
      methodName: "Priority Mail Express International"
    }]
  }, {
    netsuiteName: "USPS Priority Mail®",
    reactionsMethods: [{
      carrierName: "USPS",
      methodName: "Priority Mail"
    }]
  }
  ];
  const returnData = find(shippingAssociatedArray, o => {
    const isFind = find(o.reactionsMethods, rm =>
      (
        rm.carrierName === method.carrier ||
          rm.carrierName === method.method.carrier
      )
        && rm.methodName === method.method.label);
    return !!isFind;
  });
  return returnData;
};

const getAssosiatedNetsuiteShippingMethod = (shippingMethod, netSuiteMethods) => {
  let findNetSuiteShipingMethod = null;
  if (shippingMethod && netSuiteMethods && netSuiteMethods.length) {
    const netSuiteDetect = findAssociatedStringShippingMethod(shippingMethod);
    if (netSuiteDetect) {
      findNetSuiteShipingMethod = find(netSuiteMethods, nm => nm.name === netSuiteDetect.netsuiteName);
    } else {
      findNetSuiteShipingMethod = find(netSuiteMethods, nm => {
        const regex = new RegExp(nm.name, "i");
        return regex.test(shippingMethod);
      });
    }
  }
  return findNetSuiteShipingMethod;
};

/* </shipping> */
/* <Customers> */
const findCustomersFromEmails = (arrEmails) => {
  const service = getService();
  const preferences = new NetSuite.Search.SearchPreferences();
  preferences.pageSize = 10;
  service.setSearchPreferences(preferences);

  const search = new NetSuite.Search.CustomerSearchBasic();
  const callback = async (email) => {
    search.searchFields = [];
    const searchField = new NetSuite.Search.Fields.SearchStringField();
    searchField.field = "email";
    searchField.operator = "is";
    searchField.searchValue = email;
    search.searchFields.push(searchField);
    const searchPromise = () => service.search(search)
      .then((result) => {
        if (
          !result.searchResult.status
          || result.searchResult.status.$attributes.isSuccess !== "true"
        ) {
          return {
            key: email,
            value: null
          };
        }
        const recordList = result.searchResult.recordList;
        if (recordList && recordList.record && recordList.record.length) {
          return {
            key: email,
            value: recordList.record[0] || null
          };
        }
        return {
          key: email,
          value: null
        };
      });
    return createRequest(searchPromise);
  };
  return Promise.resolve(arrEmails)
    .mapSeries(callback)
    .then((result)  => {
      service.clearSearchPreferences();
      return result;
    });
};

const createCustomerFromOrder = async (orderId) => {
  check(orderId, String);
  try {
    const order = await Orders.findOne({ _id: orderId });
    let phone = null;
    let name = null;
    const customerAddressbookList = new NetSuite.Relationships.CustomerAddressbookList();
    customerAddressbookList.addressbook = [];
    const addresses = [
      order.billing[0].address,
      order.shipping[0].address
    ];
    _.each(addresses, async addr => {
      if (addr.phone && !phone) { phone = addr.phone; }
      if (addr.fullName && !name) { name = addr.fullName; }
      const address = await createAddressObject(addr);
      if (address) {
        const customerAddressbook = new NetSuite.Relationships.CustomerAddressbook();
        customerAddressbook.defaultBilling = addr.isBillingDefault;
        customerAddressbook.defaultShipping = addr.isShippingDefault;
        customerAddressbook.isResidential = false;
        customerAddressbook.label = "reaction user id(ANONYMOUS)";
        customerAddressbook.addressbookAddress = address;
        customerAddressbookList.addressbook.push(customerAddressbook);
      }
    });
    const customer = new NetSuite.Relationships.Customer();
    const fullName = name ? name : "USER ANONYMOUS";
    const fullNameArr = fullName.split(" ");
    let lastName = fullName;
    let firstName = fullName;
    if (fullNameArr.length >= 2) {
      firstName = fullNameArr[0];
      lastName = (fullNameArr.slice(1)).join(" ");
    } else if (fullNameArr.length === 1) {
      firstName = fullNameArr[0];
      lastName = "";
    }
    customer.firstName = firstName;
    customer.lastName = lastName;
    if (phone) {
      customer.phone =  phone;
    }
    customer.email = order.email;
    customer.addressbookList = await customerAddressbookList;
    Logger.info({ email: customer.email }, "requestData:createCustomerFromOrder");
    return createRequest(() => getService().add(customer));
  } catch (err) {
    Logger.error(err.message, "createCustomerFromOrder");
    return null;
  }
};

const createCustomerInNetsuite = async (customerId, orderEmail, orderId) => {
  check(customerId, String);
  check(orderEmail, String);
  check(orderId, String);
  try {
    const account = await Accounts.findOne({ _id: customerId });
    if (account) {
      let phone = null;
      let name = null;
      const customerAddressbookList = new NetSuite.Relationships.CustomerAddressbookList();
      customerAddressbookList.addressbook = [];
      if (account.profile && account.profile.addressBook && account.profile.addressBook.length) {
        _.each(account.profile.addressBook, async addr => {
          if (addr.phone && !phone) { phone = addr.phone; }
          if (addr.fullName && !name) { name = addr.fullName; }
          const address = await createAddressObject(addr);
          if (address) {
            const customerAddressbook = new NetSuite.Relationships.CustomerAddressbook();
            customerAddressbook.defaultBilling = addr.isBillingDefault;
            customerAddressbook.defaultShipping = addr.isShippingDefault;
            customerAddressbook.isResidential = false;
            customerAddressbook.label = `reaction user id(${customerId})`;
            customerAddressbook.addressbookAddress = address;
            customerAddressbookList.addressbook.push(customerAddressbook);
          }
        });
      }
      const customer = new NetSuite.Relationships.Customer();
      const fullName = name ? name : account.name;
      const fullNameArr = fullName.split(" ");
      let lastName = fullName;
      let firstName = fullName;
      if (fullNameArr.length >= 2) {
        firstName = fullNameArr[0];
        lastName = (fullNameArr.slice(1)).join(" ");
      } else if (fullNameArr.length === 1) {
        firstName = fullNameArr[0];
        lastName = "";
      }
      customer.firstName = firstName || "NULL";
      customer.lastName = lastName || "NULL";
      if (phone) {
        customer.phone =  phone;
      }
      customer.email = orderEmail;
      customer.addressbookList = await customerAddressbookList;
      Logger.info({ email: customer.email }, "CUSTOMER CREATE ON NETSUITE");
      return createRequest(() => getService().add(customer));
    }
    return createCustomerFromOrder(orderId);
  } catch (err) {
    Logger.error(err.message, "createCustomerInNetsuite");
    return null;
  }
};

const getCustomerInfo = async (customerId, orderEmail, orderId) => {
  check(customerId, String);
  check(orderEmail, String);
  check(orderId, String);
  try {
    const account = Accounts.findOne({ _id: customerId });
    if (account) {
      let phone = null;
      let name = null;
      if (account.profile && account.profile.addressBook && account.profile.addressBook.length) {
        _.each(account.profile.addressBook, async addr => {
          if (addr.phone && !phone) { phone = addr.phone; }
          if (addr.fullName && !name) { name = addr.fullName; }
        });
      }
      const customer = {};
      const fullName = name ? name : account.name;
      const fullNameArr = fullName.split(" ");
      let lastName = fullName;
      let firstName = fullName;
      if (fullNameArr.length >= 2) {
        firstName = fullNameArr[0];
        lastName = (fullNameArr.slice(1)).join(" ");
      } else if (fullNameArr.length === 1) {
        firstName = fullNameArr[0];
        lastName = "";
      }
      customer.firstName = firstName || "NULL";
      customer.lastName = lastName || "NULL";
      if (phone) {
        customer.phone =  phone;
      } else {
        customer.phone = "NULL";
      }
      if (orderEmail) {
        customer.email = orderEmail;
      } else {
        if (account.emails && account.emails.length) {
          _.each(account.emails, (o) => {
            if (!customer.email) {
              customer.email = o.address;
            }
          });
        } else {
          customer.email = "NULL";
        }
      }
      return customer;
    }
    return null;
  } catch (err) {
    return null;
  }
};

const getCustomerFromNetsuite = async (customerId, orderEmail) => {
  check(customerId, String);
  check(orderEmail, String);
  try {
    let findC = { _id: customerId };
    if (orderEmail) {
      findC = {
        $or: [
          { _id: customerId },
          { "emails.address": orderEmail }
        ]
      };
    }
    const customer = Accounts.findOne(findC);
    const findEmails = [];
    if (orderEmail) {
      findEmails.push(orderEmail);
    }
    if (customer.emails && customer.emails.length) {
      _.each(customer.emails, (o) => {
        if (_.findIndex(findEmails, (el) => el === o.address) === -1) {
          findEmails.push(o.address);
        }
      });
    }
    return await findCustomersFromEmails(findEmails);
  } catch (err) {
    Logger.error(err.message, "err:getCustomerFromNetsuite -> return null");
    return null;
  }
};
/* </Customers> */
/* <Orders> */
const orderUpdateStatus = (orderId, status, errors, internalId = null) => {
  const exportedErrors = [];
  _.each(errors, e => {
    if (e && e.message && Array.isArray(e.message)) {
      _.each(e.message, msg => {
        if (typeof msg === "string") { exportedErrors.push(msg); }
      });
    } else if (e && e.message && typeof e.message === "string") {
      exportedErrors.push(e.message);
    } else if (e && typeof e === "string") {
      exportedErrors.push(e);
    }
  });
  Orders.update({
    _id: orderId
  }, {
    $set: {
      isExportedToNetsuite: status,
      exportedErrors,
      netsuiteOrderId: internalId || "none"
    }
  });
  updateNSOrderJob(orderId, status);
  Logger.info({}, `Insert netsuite order(${orderId}) - ${status}`);
};

const getRCPaymentMethod = async (orderId) => {
  try {
    const order = await Orders.findOne({ _id: orderId });
    const settings = getSettings();
    let findName = null;
    if (
      settings &&
      order && order.billing && order.billing.length &&
      order.billing[0].paymentMethod &&
      order.billing[0].paymentMethod.processor
    ) {
      const processor = order.billing[0].paymentMethod.processor;
      if (processor === "PaypalExpress") {
        findName = processor; // settings.paymentConfig[processor];
      } else if (
        processor === "AuthNet" &&
        order.billing[0].paymentMethod.transactions &&
        order.billing[0].paymentMethod.transactions.length
      ) {
        _.each(order.billing[0].paymentMethod.transactions, t => {
          if (!findName && t.accountType) {
            if (typeof t.accountType === "string") {
              findName = t.accountType;
            } else if (Array.isArray(t.accountType)) {
              _.each(t.accountType, at => {
                if (!findName && typeof at === "string") {
                  findName = at;
                }
              });
            }
          }
        });
      }
    }
    return settings.paymentConfig[findName];
  } catch (err) {
    Logger.error(err.message, "err:getRCPaymentMethod -> return null");
    return null;
  }
};

const getNSPaymentMethod = async (orderId) => {
  try {
    const findName = await getRCPaymentMethod(orderId);
    let returnValue = null;
    if (findName) {
      const service = getService();
      const preferences = new NetSuite.Search.SearchPreferences();
      preferences.pageSize = 10;
      service.setSearchPreferences(preferences);
      const search = new NetSuite.Search.PaymentMethodSearchBasic();
      search.searchFields = [];
      const searchField = new NetSuite.Search.Fields.SearchStringField();
      searchField.field = "name";
      searchField.operator = "is";
      searchField.searchValue = findName;
      search.searchFields.push(searchField);
      const response = await createRequest(() => service.search(search)
        .then((result) => {
          if (
            !result.searchResult.status
            || result.searchResult.status.$attributes.isSuccess !== "true"
          ) {
            return null;
          }
          const recordList = result.searchResult.recordList;
          if (recordList && recordList.record && recordList.record.length) {
            return recordList.record[0];
          }
          return null;
        }));
      if (response && response.$attributes && response.$attributes.internalId) {
        const paymentRecordRef = new NetSuite.Records.RecordRef();
        paymentRecordRef.type = "paymentMethod";
        paymentRecordRef.internalId = response.$attributes.internalId;
        returnValue = paymentRecordRef;
      }
    }
    return returnValue;
  } catch (err) {
    Logger.error(err.message, "err:getNSPaymentMethod -> return null");
    return null;
  }
};

export const OrderAfterCreateNetsuiteSync = async (orderId) => {
  // @TODO - payment methods ["PaypalExpress", "Example", "AuthNet"]
  // "billing.paymentMethod.transactions.accountType" = "MasterCard" || "Visa"  || "AmericanExpress" || "Discover" ||
  check(orderId, String);
  const errorsToEmail = [];
  let memo = "";
  try {
    Logger.info({}, `START EXPORT ORDER(${orderId})`);
    const order = await Orders.findOne({ _id: orderId });
    if (order && order.isExportedToNetsuite === true) {
      updateNSOrderJob(order._id, true);
      return null;
    }
    if (order) {
      if (!order.email) {
        let email = "undefined@undefined";
        const account = Accounts.findOne({ _id: order.userId });
        if (account.emails.length) {
          email = account.emails[0].address;
        } else {
          errorsToEmail.push({
            message: [`Not found email on orderId(${orderId}): set fake email "admin@zzperformance.com"`]
          });
        }
        order.email = email;
        Orders.rawCollection().update({
          _id: order._id
        }, {
          $set: {
            email
          }
        });
      }
      const customerRecordRef = new NetSuite.Records.RecordRef();
      const customers = await getCustomerFromNetsuite(order.userId, order.email);
      let customer = null;
      _.each(customers || [], (o) => {
        if (o.value) {
          if (!customer && o.value.isInactive === true) {
            customer = o.value;
          } else if (!o.value.isInactive) {
            customer = o.value;
          }
        }
      });
      const customerInfo = await getCustomerInfo(order.userId, order.email, order._id);
      if (order.email !== customerInfo.email) {
        memo += `email (order): ${order.email}\n`;
        memo += `email (customer): ${customerInfo.email}\n`;
      } else {
        memo += `email: ${order.email}\n`;
      }
      memo += `customerId(${order.userId}): Name - ${customerInfo.firstName || "NULL"} ${customerInfo.lastName || "NULL"}\n`;
      memo += `phone: ${customerInfo.phone}\n`;
      if (!customer) {
        const createCustomerResponse = await createCustomerInNetsuite(order.userId, order.email, order._id);
        if (createCustomerResponse
          && createCustomerResponse.writeResponse.status
          && createCustomerResponse.writeResponse.status.$attributes.isSuccess === "true"
        ) {
          const baseRef = createCustomerResponse.writeResponse.baseRef;
          customerRecordRef.type = baseRef.$attributes.type;
          customerRecordRef.internalId = baseRef.$attributes.internalId;
        } else {
          const message = [createCustomerResponse.writeResponse.status.statusDetail.message || "status: undefined || false"];
          message.push(`customerId(${order.userId}): Name - ${customerInfo.firstName || "NULL"} ${customerInfo.lastName || "NULL"}`);
          if (customerInfo.phone) {
            message.push(`phone: ${customerInfo.phone}`);
          }
          if (customerInfo.email) {
            message.push(`email: ${customerInfo.email}`);
          }
        }
      } else {
        customerRecordRef.type = customer.$attributes.type || "customer";
        customerRecordRef.internalId = customer.$attributes.internalId;
      }
      let orderShipping = null;
      if (order.shipping.length && order.shipping[0].shipmentMethod && order.shipping[0].shipmentMethod._id) {
        orderShipping = getReactionShippingMethod(order.shipping[0]);
      }
      const shipMethod = new NetSuite.Records.RecordRef();
      const shippingList = await getShippingList();
      let shipping = null;
      if (orderShipping) {
        shipping = getAssosiatedNetsuiteShippingMethod(orderShipping, shippingList);
      }
      if (!orderShipping || !shipping) {
        _.each(shippingList, s => {
          if (!shipMethod.internalId && /[Ff]ree/.test(s.name)) {
            shipMethod.internalId = s.internalId;
          }
        });
        errorsToEmail.push({
          message: [`Not found shipping method: ${order.shipping[0].shipmentMethod.carrier + " - " || ""}${order.shipping[0].shipmentMethod.label || order.shipping[0].shipmentMethod.name}`]
        });
        errorsToEmail.push({
          message: [`Please change shipping method in netsuite to: ${order.shipping[0].shipmentMethod.carrier + " - " || ""}${order.shipping[0].shipmentMethod.label || order.shipping[0].shipmentMethod.name}`]
        });
      } else {
        shipMethod.internalId = shipping.internalId;
      }
      memo += `ship method: ${shipping && shipping.name ? shipping.name : (`${order.shipping[0].shipmentMethod.carrier + " - " || ""}${order.shipping[0].shipmentMethod.label || order.shipping[0].shipmentMethod.name}`)}\n`;
      const salesOrderItemList = new NetSuite.Sales.SalesOrderItemList();
      memo += "Items:\n";
      _.each(order.items, item => {
        memo += ` - sku: ${item.variants.sku} | quantity: ${item.quantity} | amount: ${item.variants.price * item.quantity} | rate: ${item.variants.price}\n`;
      });
      const { insertItems, errorItems } = await getItemsFromNetsuite(order._id);
      if (errorItems && errorItems.length) {
        _.each(errorItems, e => {
          errorsToEmail.push({
            message: [`Not found item in netsuite: ${e}`]
          });
        });
      }
      salesOrderItemList.item = insertItems;
      const salesOrder = new NetSuite.Sales.SalesOrder();
      salesOrder.orderStatus = "_pendingApproval";
      salesOrder.getAuth = true;
      salesOrder.ignoreAvs = true;
      salesOrder.shippingCost = 0;
      salesOrder.entity = customerRecordRef;
      salesOrder.shipMethod = shipMethod;
      salesOrder.shippingCost = order.shipping ? order.shipping[0].shipmentMethod.rate : 0;
      salesOrder.toBeEmailed = false;
      salesOrder.memo = memo;
      salesOrder.email = order.email;
      salesOrder.itemList = salesOrderItemList;
      salesOrder.billingAddress = await getBillingAddr(order);
      salesOrder.shippingAddress = await getShippingAddr(order);
      const paymentMethod = await getNSPaymentMethod(order._id);
      if (!paymentMethod) {
        const paymentNameRC = await getRCPaymentMethod(order._id);
        errorsToEmail.push({ message: ["not fount paymentMethod in NS"] });
        errorsToEmail.push({ message: [`shop payment method = ${paymentNameRC}`] });
      } else {
        salesOrder.paymentMethod = paymentMethod;
      }
      const responseSave = await createRequest(() => getService().add(salesOrder));
      if (responseSave.writeResponse.status && responseSave.writeResponse.status.$attributes.isSuccess !== "true") {
        let errMsg = "save order status: undefined || false";
        if (Array.isArray(responseSave.writeResponse.status.statusDetail)) {
          errMsg = responseSave.writeResponse.status.statusDetail[0].message;
        } else if (typeof responseSave.writeResponse.status.statusDetail === "string") {
          errMsg = responseSave.writeResponse.status.statusDetail;
        } else {
          errMsg = JSON.stringify(responseSave.writeResponse.status.statusDetail);
        }
        errorsToEmail.push({ message: [errMsg] });
        orderUpdateStatus(order._id, false, errorsToEmail);
      } else {
        const internalId = responseSave.writeResponse && responseSave.writeResponse.baseRef &&
          responseSave.writeResponse.baseRef.$attributes && responseSave.writeResponse.baseRef.$attributes.internalId ?
          responseSave.writeResponse.baseRef.$attributes.internalId : null;
        orderUpdateStatus(order._id, true, errorsToEmail, internalId);
      }
      sendErrorMail(errorsToEmail, orderId);
      return responseSave;
    }
    errorsToEmail.push({
      message: [`(getOrder = null) order_id: "${orderId}"`]
    });
    sendErrorMail(errorsToEmail, orderId);
    return null;
  } catch (err) {
    orderUpdateStatus(orderId, false, errorsToEmail);
    errorsToEmail.push({
      message: [err.message]
    });
    sendErrorMail(errorsToEmail, orderId);
    return null;
  }
};
/* </Orders> */

const recreateNetsuiteConnection = () => {
  console.log('-----recreateNetsuiteConnection', Meteor.isClient, Meteor.isAdmin)
  return recreateConnection();
};

const updateSttings = (data) => {
  check(data, Object);

  //@TODO Make update Packages to new settings. Ckeck work.
  console.log('------ Update settings ------', data);
}

Meteor.methods({
  getCustomerFromNetsuite,
  updateNSOrderJob,
  recreateNetsuiteConnection,
  updateSttings
});
