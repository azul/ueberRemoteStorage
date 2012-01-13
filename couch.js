http = require('http')
url = require('url')

remoteCouch = function(params){

  var couch = params;
  console.log('couch on ' + couch.storageAddress );

  function keyToAddress(key) {
    var i = 0;
    while(i < key.length && key[i] =='u') {
      i++;
    }
    if((i < key.length) && (key[i] == '_')) {
      key = 'u'+key;
    }
    return couch.storageAddress + key;
  }

  function doCall(method, key, value, callback) {
    console.log(method + ' request to: ' + keyToAddress(key));
    var httpObj = url.parse(keyToAddress(key));
    httpObj.method = method;
    httpObj.headers= {Authorization: 'Bearer '+ couch.bearerToken};
    var req = http.request(httpObj, function(res) {
      console.log(method +' STATUS: ' + res.statusCode);
      if(res.statusCode == 404) {
        callback(null, null)
      } else {
        res.on('data', function (chunk) {
          console.log(method + ' DATA: ' + chunk);
          callback(null, chunk)
        });
      }
    });
    req.on('error', function(e) {
      console.warn(method + 'ERROR: ' + e.status);
      callback(e, null)
    });

    if(method!='GET') {
      req.write(value);
    }
    req.end();
  }
  
  couch.getUserAddress = function() {
    return couch.storageAddress
  }


  couch.get = function(key, callback) {
    console.log('couch.get("'+key+'", callback);');
    doCall('GET', key, null, function(err, str) {
      if(err != null || str == null)
      {
        callback(err, null)
        return;
      }

      var obj = JSON.parse(str);
      
      couch['_shadowCouchRev_'+key] = obj._rev;
      callback(false, obj.value);
    });
  }

  couch.set = function(key, value, callback) {
    console.log('couch.set("'+key+'", "'+value+'", callback);');
    var revision = couch['_shadowCouchRev_'+key];
    var obj = {
      value: value
    };
    if(revision) {
      obj._rev = revision;
    }
    doCall('PUT', key, JSON.stringify(obj), function(err, str) {
      if(str == null)
      {
        callback(err);
        return;
      }
      var obj = JSON.parse(str);
      if(obj != null && obj.rev) {
        couch['_shadowCouchRev_'+key] = obj.rev;
      }
      callback(err);
    });
  }
 
  couch.remove = function(key, callback) {
    console.log('couch.remove("'+key+'", callback);');
    doCall('DELETE', key, null, callback);
  } 
  return couch
}

exports.remoteCouch = remoteCouch;