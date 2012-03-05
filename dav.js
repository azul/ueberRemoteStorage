http = require('http')
https = require('https')
url = require('url')

remoteDAV = function(params){
  // params are most likely
  // backendAddress
  // backendToken
  var dav = params;

  function keyToAddress(key) {
    var i = 0;
    while(i < key.length && key[i] =='u') {
      i++;
    }
    if((i < key.length) && (key[i] == '_')) {
      key = 'u'+key;
    }
    return dav.storageAddress + key;
  }

  function doCall(method, key, value, deadLine, callback) {
    var httpObj = url.parse(keyToAddress(key));
    httpObj.method = method;
    httpObj.headers = { Authorization: 'Bearer '+ dav.bearerToken }
    if(value) httpObj.headers["Content-Length"] = value.length;
    httpObj.fields={withCredentials: 'true'};
    var proto = (httpObj.protocol == 'https:') ? https : http;
    var req = proto.request(httpObj, function(res) {
      console.log(method +' STATUS: ' + res.statusCode);
      if(res.statusCode == 404) {
        callback(null, null)
      } else {
        res.on('data', function (chunk) {
          console.log(method + 'DATA: ' + chunk);
          callback(null, chunk)
        });
      }
      if(method=='PUT') {
        callback(null, null)
      }
    });
    req.on('error', function(e) {
      // I have no idea if this works. Could not find info about the
      // error in the API
      if(e.status == 404) {
        callback(null, null)
      } else {
        callback(e, null)
      }
    });

    if(method!='GET') {
      req.write(value);
    }
    req.end();
  }

  dav.getUserAddress = function() {
    return dav.storageAddress
  }

  dav.get = function(key, callback) {
    doCall('GET', key, null, null, callback);
  }

  dav.set = function(key, value, callback) {
    doCall('PUT', key, value, null, callback);
  }
 
  dav.remove = function(key, callback) {
    doCall('DELETE', key, null, null,  callback);
  } 
  return dav
}

exports.remoteDAV = remoteDAV;
