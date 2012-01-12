var couch = require("./couch");
console.log("Initialize Couch...");

exports.remote = function(settings)
{
  this.backend=null;

  this.settings = settings;
  this.settings.cache = 0;
  this.settings.writeInterval = 0;
  this.settings.json = true;
}

exports.remote.prototype.init = function(callback)
{
  this.backend=couch.remoteCouch(this.settings);
  callback();
}

exports.remote.prototype.get = function(key, callback)
{
  this.backend.get(key, callback);
}

exports.remote.prototype.set = function(key, value, callback)
{
  console.log("Couch SET " + key)
  this.backend.set(key, value, callback);
}

exports.remote.prototype.remove = function(key, callback)
{
  console.log("Couch REMOVE " + key)
  this.backend.remove(key, callback);
}

exports.remote.prototype.doBulk = function (bulk, callback)
{
  var _this = this;
  for(var i in bulk)
  {  
    if(bulk[i].type == "set")
    {
      this.backend.set(bulk[i].key, bulk[i].value, null)
    }
    else if(bulk[i].type == "remove")
    {
      this.backend.remove(bulk[i].key, null)
    }
  }
}

exports.remote.prototype.close = function(callback)
{
  callback(null);
}

