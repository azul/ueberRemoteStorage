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

var couch = require("felix-couchdb");
var async = require("async");
var url = require("url");

exports.remote = function(settings)
{
  this.backend=null;
  this.client=null;
  
  this.settings = settings;
  console.warn("initialized Couch with:\n" + JSON.stringify(settings, null, 2)); 
  
  //set default settings
  this.settings.cache = 100;
  this.settings.writeInterval = 500;
  this.settings.json = false;
}

exports.remote.prototype.init = function(callback)
{
  // now this is a bit strange because we use a proxy so the 
  // actual domain ends up in the path and thus in the remote name.
  // and we use port 80.
  var _this = this;
  var httpObj = url.parse(this.settings.storageAddress);
  this.client = couch.createClient(5984, httpObj.host, null, null, 0);
  // we need to rewrite authorization.
  this.client._authorizationHeaders = function(headers) {
    headers.Authorization = "Basic " + _this.settings.bearerToken;
    return headers;
  };
//  console.warn("db name "+httpObj.pathname.substr(1));
  this.backend = this.client.db('documents');
  callback();
}

exports.remote.prototype.get = function (key, callback)
{
  this.backend.getDoc(key, function(er, doc)
  {
    if(doc == null)
    {
      callback(null, null);
    }
    else
    {
      callback(null, doc.value);
    }
  });
}

exports.remote.prototype.set = function (key, value, callback)
{
  var _this = this;
  this.backend.getDoc(key, function(er, doc)
  {
    if(doc == null)
    {
      _this.backend.saveDoc({_id: key, value: value}, callback);
    }
    else
    {
      _this.backend.saveDoc({_id: key, _rev: doc._rev, value: value}, callback);
    }
  });
}

exports.remote.prototype.remove = function (key, callback)
{
  var _this = this;
  this.backend.getDoc(key, function(er, doc)
  {
    if(doc == null)
    {
      callback(null);
    }
    else
    {
      _this.backend.removeDoc(key, doc._rev, function(er,r)
      {
        callback(null);
      });
    }
  });
}

exports.remote.prototype.doBulk = function (bulk, callback)
{
  var _this = this;
  var keys = [];
  var revs = {};
  var setters = [];
  for(var i in bulk)
  {
    keys.push(bulk[i].key);
  }
  async.series([
    function(callback)
    {
      _this.backend.request({
        method: 'POST',
        path: '/_all_docs',
        data: {keys: keys},
      }, function(er, r)
      {
        if (er)
        {
          console.warn("Error in _all_docs request:\n"+ JSON.stringify(er)); 
          console.warn("keys:\n"+ JSON.stringify(keys, null, 2)); 
          console.warn("settings:\n"+ JSON.stringify(_this.settings, null, 2)); 
          throw new Error(JSON.stringify(er));
        }
        rows = r.rows;
        for(var j in r.rows)
        {
          // couchDB will return error instead of value if key does not exist
          if(rows[j].value!=null)
          {
            revs[rows[j].key] = rows[j].value.rev;
          }
        }
        callback();
      });
    },
    function(callback)
    {
      for(var i in bulk)
      {
        var item = bulk[i];
        var set = {_id: item.key};
        if(revs[item.key] != null)
        {
          set._rev = revs[item.key];
        }
        if(item.type == "set")
        {
          set.value = item.value;
          setters.push(set);
        }
        else if(item.type == "remove")
        {
          set._deleted = true;
          setters.push(set);
        }
      }
      callback();
    }], function(err) {
      if (err)
      {
        console.warn("Error in bulk async callback:\n"+ JSON.stringify(err)); 
        throw new Error(JSON.stringify(er));
      }
      _this.backend.bulkDocs({docs: setters}, function(err, value)
      {
        if (err)
        {
          console.warn("Error in bulkDocs callback:\n"+ JSON.stringify(err)); 
        }
        callback(err,value);
      });
    }
  );
}

exports.remote.prototype.close = function(callback)
{
  if(callback) callback();
}
