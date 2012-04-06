var async = require("async");

exports.remote = function(_settings)
{
  this.backend = null;
  this.settings = _settings;
  this.settings.json = true;
}

exports.remote.prototype.init = function(callback)
{
  this.backend={};
  if(this.settings.invalid){
    callback('invalid', {reason: 'Stub for an invalid storage'})
  } else {
    callback(null, this);
  }
}

exports.remote.prototype.get = function(key, callback)
{
  var val = this.backend[key];
  callback(!val, val);
}

exports.remote.prototype.set = function(key, value, callback)
{
  this.backend[key] = value;
  callback();
}

exports.remote.prototype.remove = function(key, callback)
{
  delete this.backend[key];
}

exports.remote.prototype.doBulk = function (bulk, callback)
{
  var _this = this;
  
  function setOrRemove(operation, callback){
    if(operation.type == "set")
    {
      _this.set(operation.key, operation.value, callback)
    }
    else if(operation.type == "remove")
    {
      _this.remove(operation.key, callback)
    }
    else 
    {
      console.error("Invalid Operation in doBulk: "+operation);
      callback(); // let's continue never the less...
    }
  }

  async.forEachLimit(bulk, 8, setOrRemove, callback);
}

exports.remote.prototype.close = function(callback)
{
  if(callback) callback();
}

