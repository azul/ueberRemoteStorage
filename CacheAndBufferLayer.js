/**
 * 2011 Peter 'Pita' Martischka
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

/**
This module is made for the case, you want to use a RemoteStorage as a JSON KeyValue Store.

The idea of the backendWrapper is to provide following features:

* automatic JSON serialize/deserialize to abstract that away from the remote driver and the module user. 
* cache reads. A amount of KeyValues are hold in the memory, so that reading is faster. 
* Buffer Backend Writings. Sets and deletes should be buffered to make them in a setted interval with a bulk. This reduces the overhead of remote transactions and makes the remote faster. But there is also a danger to loose data integrity, to keep that, we should provide a flush function.  

All Features can be disabled or configured. The Wrapper provides default settings that can be overwriden by the driver and by the module user. 
*/

var async = require("async");

var defaultSettings =
{
  //the number of elements that should be cached. To Disable cache just set it to zero
  cache: 1000,
  //the interval in ms the wrapper writes to the remote. To Disable interval writes just set it to zero
  writeInterval: 100,
  //a flag if the data sould be serialized/deserialized to json
  json:true
}

/**
 The constructor of the wrapper
 @param wrappedBackend The Backend that should be wrapped
 @param settings (optional) The settings that should be applied to the wrapper
*/
exports.remote = function(wrappedBackend, settings, logger)
{
  //saved the wrappedBackend
  this.wrappedBackend=wrappedBackend;
  this.logger = logger;  

  //apply default settings
  this.settings               = {};
  this.settings.cache         = defaultSettings.cache;
  this.settings.writeInterval = defaultSettings.writeInterval;
  this.settings.json          = defaultSettings.json;

  //try to apply the settings of the driver
  if(wrappedBackend.settings != null)
  {  
    if(wrappedBackend.settings.cache         != null)  this.settings.cache         = wrappedBackend.settings.cache;
    if(wrappedBackend.settings.writeInterval != null)  this.settings.writeInterval = wrappedBackend.settings.writeInterval;
    if(wrappedBackend.settings.json          != null)  this.settings.json          = wrappedBackend.settings.json;
  }

  //try to apply the settings given with the constructor
  if(settings != null)
  {
    if(settings.cache         != null)  this.settings.cache         = settings.cache;
    if(settings.writeInterval != null)  this.settings.writeInterval = settings.writeInterval;
    if(settings.json          != null)  this.settings.json          = settings.json;
  }
  
  //freeze the settings at this point
  this.settings = Object.freeze(this.settings);
  
  /**
   key is the key of the keyValue Object
   value is a object
   {
     value: the value of the keyValue object, contains only deserialized data
     dirty: true or false, means if its already written to the remote or not
     callback: (optional) a array of callbacks that should be called once this value is written
     timestamp: a timestamp that shows when this item was read or write the last time. 
                The Garbage collector needs this value
   }  
   I moved this into the remote so it's per remote and not shared.
  */
  this.buffer = {};

  //the length of the Buffer.
  this.bufferLength = 0;

  //start the write Interval
  if(this.settings.writeInterval > 0)
  {
    setInterval(flush, this.settings.writeInterval, this);
  }
  
  //set the flushing flag to false, this flag shows that there is a flushing action happing at the moment
  this.isFlushing = false;
};

/**
 wraps the init function of the original DB
*/
exports.remote.prototype.init = function(callback)
{
  this.wrappedBackend.init(callback);
}

/**
 wraps the close function of the original DB
*/
exports.remote.prototype.close = function(callback)
{
  this.wrappedBackend.close(callback);
}

/**
 Calls the callback the next time all buffers are flushed
*/
exports.remote.prototype.doShutdown = function(callback)
{
  //wait until the buffer is fully written
  if(this.settings.writeInterval > 0)
    this.shutdownCallback = callback;
  //we write direct, so there is no need to wait for a callback  
  else
    callback();
}

/**
 Gets the value trough the wrapper. 
*/
exports.remote.prototype.get = function(key, callback)
{
  //if cache is enabled and data is in the cache, get the value from the cache
  if(this.settings.cache > 0 && this.buffer[key])
  {
    this.logger.debug("GET    - " + key + " - " + JSON.stringify(this.buffer[key].value) + " - from cache");
    this.buffer[key].timestamp = new Date().getTime();
    callback(null, this.buffer[key].value);
  }
  //caching is disabled but its still in a dirty writing cache, so we have to get the value out of the cache too
  else if(this.settings.cache == 0 && this.buffer[key] && this.buffer[key].dirty)
  {
    this.logger.debug("GET    - " + key + " - " + JSON.stringify(this.buffer[key].value) + " - from dirty buffer");
    this.buffer[key].timestamp = new Date().getTime();
    callback(null, this.buffer[key].value);
  }
  //get it direct
  else
  {
    var self = this;
  
    this.wrappedBackend.get(key, function(err,value)
    {  
      if(self.settings.json)
      {
        try
        {
          value = JSON.parse(value);
        }
        catch(e)
        {
          console.error("JSON-PROBLEM:" + value);
          callback(e);
          return;
        }
      }
    
      //cache the value if caching is enabled
      if(self.settings.cache > 0)
        self.buffer[key] = {"value":value, dirty:false, timestamp: new Date().getTime(), writingInProgress: false};
      
      self.bufferLength++;
      
      //call the garbage collector
      self.gc();
      
      self.logger.debug("GET    - " + key + " - " + JSON.stringify(value) + " - from remote ");

      callback(err,value);
    });
  }
}

/**
 Sets the value trough the wrapper
*/
exports.remote.prototype.set = function(key, value, bufferCallback, writeCallback)
{
  //writing cache is enabled, so simply write it into the buffer
  if(this.settings.writeInterval > 0)
  {
    this.logger.debug("SET    - "+ key + " - " + JSON.stringify(value) + " - to buffer");

    //initalize the buffer object if it not exists
    if(!this.buffer[key]) 
    {
      this.buffer[key] = {};
      this.bufferLength++;
    }
    
    //set the new values
    this.buffer[key].value = value;
    this.buffer[key].dirty = true;
    this.buffer[key].timestamp = new Date().getTime();
    
    //call the garbage collector
    this.gc();
    
    //initalize the callback array in the buffer object if it not exists.
    //we need this as an array, cause the value may be many times overwritten bevors its finally written to the remote, 
    //but all callbacks must be called
    if(!this.buffer[key].callbacks) 
      this.buffer[key].callbacks=[];
    
    //add this callback to the array
    if(writeCallback) this.buffer[key].callbacks.push(writeCallback);
    else
    {
      this.buffer[key].callbacks.push(function(err)
      {
        if(err) throw err;
      });
    }
    
    //call the buffer callback
    if (bufferCallback) bufferCallback();
  }
  //writecache is disabled, so we write directly to the remote
  else
  {
    this.logger.debug("SET    - " + key + " - " + JSON.stringify(value) + " - to remote");

    //create a wrapper callback for write and buffer callback
    var callback = function (err)
    {
      if (bufferCallback) bufferCallback(err);
      if (writeCallback) writeCallback(err);
    }
  
    //The value is null, means this no set operation, this is a remove operation
    if(value==null)
    {
      this.wrappedBackend.remove(key,callback);
    }
    //thats a correct value
    else
    {
      //stringify the value if stringifying is enabled
      if(this.settings.json == true)
        value = JSON.stringify(value);
    
      this.wrappedBackend.set(key,value,callback);
    }
  }
}

/**
 Sets a subvalue
*/
exports.remote.prototype.setSub = function(key, sub, value, bufferCallback, writeCallback)
{
  var _this = this;

  this.logger.debug("SETSUB - " + key + JSON.stringify(sub) + " - "+ JSON.stringify(value));

  async.waterfall([
    //get the full value
    function(callback)
    {
      _this.get(key, callback);
    },
    //set the sub value and set the full value again 
    function(fullValue, callback)
    {
      //get the subvalue parent
      var subvalueParent = fullValue;
      for (var i=0 ; i < (sub.length-1) ; i++)
      {
        //test if the subvalue exist
        if(subvalueParent != null && subvalueParent[sub[i]] !== undefined)
        {
          subvalueParent = subvalueParent[sub[i]];
        }
        //the subvalue doesn't exist, create it
        else
        {
          subvalueParent[sub[i]] = {};
          subvalueParent = subvalueParent[sub[i]];
        }
      }
      
      //set the subvalue, we're doing that with the parent element
      subvalueParent[sub[sub.length-1]] = value;
      
      _this.set(key, fullValue, bufferCallback, writeCallback);
    }
  ],function(err)
  {
    if(callback) callback(err);
    else if(err != null) throw err;
  })
}

/**
 Returns a sub value of the object
 @param sub is a array, for example if you want to access object.test.bla, the array is ["test", "bla"]
*/
exports.remote.prototype.getSub = function(key, sub, callback)
{
  var _this = this;

  //get the full value
  this.get(key, function (err, value)
  {
    //there happens an errror while getting this value, call callback
    if(err)
    {
      callback(err);
    }
    //everything is correct, navigate to the subvalue and return it
    else
    {
      var subvalue = value;
      
      for (var i=0 ; i<sub.length ; i++)
      {
        //test if the subvalue exist
        if(subvalue != null && subvalue[sub[i]] !== undefined)
        {
          subvalue = subvalue[sub[i]];
        }
        //the subvalue doesn't exist, break the loop and return null
        else
        {
          subvalue = null;
          break;
        }
      }
      
      _this.logger.debug("GETSUB - " + key + JSON.stringify(sub) + " - " + JSON.stringify(subvalue));
      callback(err, subvalue);
    }
  });
}

/**
 Removes the value trough the wrapper
*/
exports.remote.prototype.remove = function(key, bufferCallback, writeCallback)
{
  this.logger.debug("REMOVE - " + key);

  //make a set to null out of it
  this.set(key, null, bufferCallback, writeCallback);
}

/**
 Garbage Collector of the cache
*/
exports.remote.prototype.gc = function()
{
  //If the buffer size is under the settings size or cache is disabled -> return cause there is nothing to do
  if(this.bufferLength < this.settings.cache || this.settings.cache == 0)
  {
    return;
  }
  
  //collect all values that are not dirty
  var deleteCandidates = [];
  for(var i in this.buffer)
  {
    if(this.buffer[i].dirty == false && this.buffer[i].writingInProgress == false)
    {
      deleteCandidates.push({key: i, timestamp: this.buffer[i].timestamp});
    }
  }
  
  if(deleteCandidates.length > 0)
  {
    //sort them based on the timestamp
    deleteCandidates.sort(function(a,b){
      return a.timestamp-b.timestamp;
    });
    
    var collected = 0;

    //delete the half buffer
    for(var i=0; (this.bufferLength > this.settings.cache/2) && i<deleteCandidates.length;i++)
    {
      delete this.buffer[deleteCandidates[i].key];
      this.bufferLength--;
      collected++;
    }

    this.logger.info("garbage collected "+ collected+ " values");
  }
}

/**
 Writes all dirty values to the remote
*/
function flush (backend, callback)
{
  //return if there is a flushing action in process
  if(backend.isFlushing)
  {
    if(callback) callback();
    return;
  }

  var operations = [];
  var callbacks = [];

  //run trough the buffer and search for dirty values
  for(var i in backend.buffer)
  {
    if(backend.buffer[i].dirty == true)
    {
      //collect all data for the operation
      var type  = backend.buffer[i].value == null ? "remove" : "set";
      var key   = i;
      var value = backend.buffer[i].value;
      
      //stringify the value if stringifying is enabled
      if(backend.settings.json == true && value != null)
        value = JSON.stringify(value);
      else
        value = clone(value);
      
      //add the operation to the operations array
      operations.push({"type":type, "key":key, "value":value});
      
      //collect callbacks
      callbacks = callbacks.concat(backend.buffer[i].callbacks);
      
      //clean callbacks
      backend.buffer[i].callbacks = [];
      //set the dirty flag to false
      backend.buffer[i].dirty = false;
      //set the writingInProgress flag to true
      backend.buffer[i].writingInProgress = true;
    }
  }
  
  //send the bulk to the remote driver and call the callbacks with the results  
  if(operations.length > 0)
  {      
    backend.logger.info("Flushed " + operations.length + " values");

    //set the flushing flag
    backend.isFlushing = true;
    
    backend.wrappedBackend.doBulk(operations, function(err)
    {
      //call all writingCallbacks
      for(var i in callbacks)
      {
        callbacks[i](err);
      }

      //set the writingInProgress flag to false
      for(var i in operations)
      {
        backend.buffer[operations[i].key].writingInProgress = false;
      }
      
      if(callback) callback();
      
      //call the garbage collector
      backend.gc();
      
      //set the flushing flag to false
      backend.isFlushing = false;
    });
  }
  //the writing buffer is empty and there is a shutdown callback, call it!
  else if(backend.shutdownCallback != null)
  {
    backend.shutdownCallback();
    backend.shutdownCallback = null;
  }
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

