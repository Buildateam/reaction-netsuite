import React, {Component} from 'react';
//import { NetSuiteConfig } from "../../../lib/collections/schemas";
//
import SettingsField from './SettingsField';
import { Meteor } from "meteor/meteor";
import { Packages } from "/lib/collections";
import {Reaction} from "../../../../../../../client/api";

class UINetSuite extends Component {
  constructor(props) {
    super(props);
    this.state = {
      account: "",
      applicationId:"",
      email:"",
      password: "",
      paymentConfig: {
        PaypalExpress: "Paypal",
        MasterCard: "Master Card",
        CreditCard: "Credit Card",
        Visa: "VISA",
        AmericanExpress: "American Express",
        Discover: "",
        Affirm: ""
      },
      role: "",
      webservicesDomain: "https://webservices.sandbox.netsuite.com"
    };

    this.handleInputChange = this.handleInputChange.bind(this);
  }

  componentDidMount(){
    const { netsuite } = this.props;

    const shop = netsuite.fetch()[0];
    const shopSettings = shop.settings;

    this.setState(shopSettings);

    console.log('=+====',this.state);
  }

  handleInputChange(event) {
    const target = event.target;
    const name = target.name;

    if (this.state[name].length > 40){
      alert("Very long string "+ name);
      return;
    }

    this.setState({
      [name]: event.target.value
    });

    console.log('state', this.state);
  }

  handleInputChangePay(event){
    const target = event.target;
    const name = target.name;

    const value = event.target.value.toString();

    if (this.state.paymentConfig[name].length > 40){
       alert("Very long string "+ name);
       return;
    }

    const pay = Object.assign({}, this.state.paymentConfig, { [name]: value} );

    this.setState({
      paymentConfig: pay
    });


  }

  onSubmit(){

    // alert( Reaction.getShopId() + Packages.find({_Id: Reaction.getShopId() }));
    //
    // Packages.update({
    //      name: "netsuite-sync",
    //      shopId: Reaction.getShopId()
    //    }, {
    //      $set: {
    //        "settings.email": "tert@tet.ru"
    //      }
    // });


    Meteor.call("updateSttings", this.state);
    //Meteor.call("recreateNetsuiteConnection");

  }

  render() {
    const { netsuite } = this.props;

    const shop = netsuite.fetch()[0];
    const shopSettings = shop.settings;

    let fieldSet = [];
    let paySet = [];

    for (var key in shopSettings){

      if (key == "paymentConfig"){
        for (var payKey in shopSettings[key]){
          paySet.push(<SettingsField key={payKey} type={payKey} settings={this.state.paymentConfig[payKey]} onChange={this.handleInputChangePay.bind(this)}/>);
        }
        continue;
      } else if(key == "errorEmails"){
        continue;
      }
      fieldSet.push(<SettingsField key={key} type={key} settings={this.state[key]} onChange={this.handleInputChange}/>);
    }

    return(
      <div className="panel panel-default">
        <div className="panel-heading">
          <h4 className="panel-title">Netsuite Connection</h4>
        </div>
        <div className="panel-body">
          <hr/>
          <h3>General config</h3>
          <hr/>
          <form id="netsuiteSyncUpdateForm" noValidate="novalidate">
            {fieldSet}
            <hr />
            <h3>Payment config (NS associate)</h3>
            <hr />
            {paySet}
            <hr />
            <button type="submit" className="rui btn btn-danger pull-right" onClick={this.onSubmit}>
              Save Changes
            </button>
          </form>
        </div>
      </div>
    );
  }
}

export default UINetSuite;
