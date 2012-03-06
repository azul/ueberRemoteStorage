var dav = require("./dav");
var async = require("async");

exports.remote = function(settings)
{
  this.backend=null;

  this.settings = settings;
  console.warn("initialized WebDAV with:\n" + JSON.stringify(settings, null, 2)); 
  this.settings.cache = 100;
  this.settings.writeInterval = 50;
  this.settings.json = true;
}

exports.remote.prototype.init = function(callback)
{
  this.backend=dav.remoteDAV(this.settings);
  callback();
}

exports.remote.prototype.get = function(key, callback)
{
  this.backend.get(key, callback);
}

exports.remote.prototype.set = function(key, value, callback)
{
  console.log("DAV SET " + key)
  this.backend.set(key, value, callback);
}

exports.remote.prototype.remove = function(key, callback)
{
  console.log("DAV REMOVE " + key)
  this.backend.remove(key, callback);
}

exports.remote.prototype.doBulk = function (bulk, callback)
{
  var _this = this;
  
  function setOrRemove(operation, callback){
    if(operation.type == "set")
    {
      _this.backend.set(operation.key, operation.value, callback)
    }
    else if(operation.type == "remove")
    {
      _this.backend.remove(operation.key, callback)
    }
    else 
    {
      console.error("Invalid Operation in doBulk: "+operation);
      callback(null); // let's continue never the less...
    }
  }

  async.forEachLimit(bulk, 8, setOrRemove, callback);
}

exports.remote.prototype.close = function(callback)
{
  callback(null);
}

