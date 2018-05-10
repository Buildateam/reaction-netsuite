import React, {Component} from 'react';

class SettingsField extends Component {
  render(){
    const { type, settings, onChange} = this.props;

   // console.log('-----SettingsField ', type, settings, this.props);

    return(
      <div className="form-group">
        <label htmlFor={`${type}`}>
          {`${type}`}
        </label>
          <br />
          <input name={`${type}`} type="text" value={settings} onChange={onChange} />
          <span className="help-block"></span>
          <br />
      </div>
    )
  }
}

export default SettingsField;
