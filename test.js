//
// testing the different storage adapters
//
// Call this with a single arg that is a JSON serialization of the StorageInfo.
// Easiest way to retrieve that currently is from the redis db.


var async = require("async");
var log4js = require('log4js');
var ueberRemote = require('./CloneAndAtomicLayer');

var record = JSON.parse(process.argv[2]);
var settings = {
  bearerToken: record.bearerToken,
  storageApi: record.storageInfo.api,
  storageAddress: record.storageInfo.template.replace("{category}","documents"),
  auth: record.storageInfo.auth
}
console.log(settings);


var storage = new ueberRemote.remote(settings.storageApi, settings, null, log4js.getLogger("remoteDB"));

async.series([
  function(callback) {
    storage.init(callback);
  },
  function(callback) {
    storage.set("test", {dis: 'is', just: 'a-test'}, callback);
  },
  function(callback) {
    storage.get("test", function(err, value) {
      console.log("Error: " + JSON.stringify(err, null, 2));
      console.log("Value: " + JSON.stringify(value, null, 2));
      callback();
    });
  },
  function(callback) {
    storage.close(callback);
  }],
  function(err) {
    console.log("done");
    if(err) console.error(err);
    setTimeout(function(){
      process.exit(0);
    },
    1000);
  }
);
