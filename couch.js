http = require('http')
url = require('url')

remoteCouch = function(params){

  var couch = params;

  function keyToAddress(key) {
    var i = 0;
    while(i < key.length && key[i] =='u') {
      i++;
    }
    if((i < key.length) && (key[i] == '_')) {
      key = 'u'+key;
    }
    return couch.backendAddress + key;
  }

  function doCall(method, key, value, deadLine, callback) {
    var httpObj = url.parse(keyToAddress(key));
    httpObj.method = method;
    httpObj.headers= {Authorization: 'Bearer '+ couch.backendToken};
    var req = http.request(httpObj, function(res) {
      console.log(method +' STATUS: ' + res.statusCode);
      if(res.statusCode == 404) {
        callback(false, null)
      } else {
        res.on('data', function (chunk) {
          console.log(method + 'DATA: ' + chunk);
          callback(false, chunk)
        });
      }
      if(method='PUT') {
        callback(false, null)
      }
    });
    req.on('error', function(e) {
      // I have no idea if this works. Could not find info about the
      // error in the API
      if(e.status == 404) {
        callback(false, null)
      } else {
        callback(e, null)
      }
    });

    if(method!='GET') {
      req.write(value);
    }
    req.end();
  }
  
  couch.getUserAddress = function() {
    return couch.backendAddress
  }


  couch.get = function(key, callback) {
    console.log('couch.get("'+key+'", callback);');
    doCall('GET', key, null, function(str) {
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
      var obj = JSON.parse(str);
      if(obj.rev) {
        couch['_shadowCouchRev_'+key] = obj.rev;
      }
      callback();
    });
  }
 
  couch.remove = function(key, callback) {
    console.log('couch.remove("'+key+'", callback);');
    doCall('DELETE', key, null, callback);
  } 
  return couch
}

exports.remoteCouch = remoteCouch;
