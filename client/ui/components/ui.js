import React, {Component} from 'react';
import { NetSuiteConfig } from "../../../lib/collections/schemas";

class UINetSuite extends Component {
  // componentDidMount() {
  //   console.log('------', Components);
  // };

  render() {

    const { packages } = this.props;

    console.log('+++++++ props', packages);
    return(
      <div className="panel panel-default">
        <div className="panel-heading">
          <h4 className="panel-title">Netsuite Connection</h4>
        </div>
        <div className="panel-body">
          <hr/>
          <h3>General config</h3>
          <hr/>
          <h1>Hello World</h1>
          <hr />
          <h3>Payment config (NS associate)</h3>
          <hr />
          <hr />
        </div>
      </div>
    );
  }
}

export default UINetSuite;
