/**
 * 2012 Max 'Azul' Wiehle
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var cacheAndBufferLayer = require("./CacheAndBufferLayer");
var async = require("async");
var channels = require("channels");

var defaultLogger = {debug: function(){}, info: function(){}, error: function(){}, warn: function(){}};

/**
 The Constructor
*/
exports.remote = function(type, backendSettings, wrapperSettings, logger)
{
  if(!type || type == 'undefined')
  {
    type = "couch";
  }

  //saves all settings and require the backend module
  this.type = type;
  this.backend_module = require("./" + type + "_backend");
  this.backendSettings = backendSettings; 
  this.wrapperSettings = wrapperSettings; 
  this.logger = logger || defaultLogger;
  this.channels = new channels.channels(doOperation);
}

exports.remote.prototype.init = function(callback)
{
  var backend = new this.backend_module.remote(this.backendSettings);
  this.backend = new cacheAndBufferLayer.remote(backend, this.wrapperSettings, this.logger);
  this.backend.init(callback);
}

/**
 Wrapper functions
*/

exports.remote.prototype.doShutdown = function(callback)
{
  this.backend.doShutdown(callback);
}

exports.remote.prototype.get = function (key, callback)
{
  this.channels.emit(key, {"backend": this.backend, "type": "get", "key": key, "callback": callback});
}

exports.remote.prototype.set = function (key, value, bufferCallback, writeCallback)
{
  this.channels.emit(key, {"backend": this.backend, "type": "set", "key": key, "value": clone(value), "bufferCallback": bufferCallback, "writeCallback": writeCallback});
}

exports.remote.prototype.getSub = function (key, sub, callback)
{
  this.channels.emit(key, {"backend": this.backend, "type": "getsub", "key": key, "sub": sub, "callback": callback});
}

exports.remote.prototype.setSub = function (key, sub, value, bufferCallback, writeCallback)
{
  this.channels.emit(key, {"backend": this.backend, "type": "setsub", "key": key, "sub": sub, "value": clone(value), "bufferCallback": bufferCallback, "writeCallback": writeCallback});
}

exports.remote.prototype.remove = function (key, bufferCallback, writeCallback)
{
  this.channels.emit(key, {"backend": this.backend, "type": "remove", "key": key, "bufferCallback": bufferCallback, "writeCallback": writeCallback});
}

function doOperation (operation, callback)
{
  if(operation.type == "get")
  {
    operation.backend.get(operation.key, function(err, value)
    {
      //clone the value
      value = clone(value);
      
      //call the caller callback
      operation.callback(err, value);
      
      //call the queue callback
      callback();
    });
  }
  else if(operation.type == "set")
  {  
    operation.backend.set(operation.key, operation.value, function(err)
    {
      //call the queue callback
      callback();
      
      //call the caller callback
      if(operation.bufferCallback) operation.bufferCallback(err);
    }, operation.writeCallback);
  }
  else if(operation.type == "getsub")
  {
    operation.backend.getSub(operation.key, operation.sub, function(err, value)
    {
      //clone the value
      value = clone(value);
      
      //call the caller callback
      operation.callback(err, value);
      
      //call the queue callback
      callback();
    });
  }
  else if(operation.type == "setsub")
  {
    operation.backend.setSub(operation.key, operation.sub, operation.value, function(err)
    {
      //call the queue callback
      callback();
      
      //call the caller callback
      if(operation.bufferCallback) operation.bufferCallback(err);
    }, operation.writeCallback);
  }
  else if(operation.type == "remove")
  {
    operation.backend.remove(operation.key, function(err)
    {
      //call the queue callback
      callback();
      
      //call the caller callback
      if(operation.bufferCallback) operation.bufferCallback(err);
    }, operation.writeCallback);
  }
}

exports.remote.prototype.close = function(callback)
{
  this.backend.close(callback);
}

function clone(obj)
{
  // Handle the 3 simple types, and null or undefined
  if (null == obj || "object" != typeof obj) return obj;

  // Handle Date
  if (obj instanceof Date)
  {
    var copy = new Date();
    copy.setTime(obj.getTime());
    return copy;
  }

  // Handle Array
  if (obj instanceof Array)
  {
    var copy = [];
    for (var i = 0, len = obj.length; i < len; ++i)
    {
      copy[i] = clone(obj[i]);
    }
    return copy;
  }

  // Handle Object
  if (obj instanceof Object)
  {
    var copy = {};
    for (var attr in obj)
    {
      if (obj.hasOwnProperty(attr)) copy[attr] = clone(obj[attr]);
    }
    return copy;
  }

  throw new Error("Unable to copy obj! Its type isn't supported.");
}
