import React, {Component} from 'react';
//import { NetSuiteConfig } from "../../../lib/collections/schemas";
import SettingsField from './SettingsField';

class UINetSuite extends Component {
  constructor(props) {
    super(props);
    this.state = {
      account: "1111111111111111111",
      applicationId:"11111111111111",
      email:"1111111111111",
      password: "11111111111111",
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

    this.setState({
      [name]: event.target.value
    });

    console.log('state', this.state);
  }

  handleInputChangePay(event) {
    const target = event.target;
    const name = target.name;

    const paySystem = "paymentConfig."+[name];

    const pay = Object.assign({}, this.state.paymentConfig, {paySystem: event.target.value} );
    console.log('---', pay);

    // this.setState((this.state.[name], event.target.value) =>{
    //   console.log('------------', this.state.[name], event.target.value)
    //   return {this.state.[name]: event.target.value}
    // })
    // this.setState({
    //   [name]: event.target.value
    // });

    console.log('state', this.state);
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
          paySet.push(<SettingsField key={payKey} type={payKey} settings={this.state.paymentConfig[payKey]} onChange={this.handleInputChangePay}/>);
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
          </form>
        </div>
      </div>
    );
  }
}

export default UINetSuite;
