http = require('http')
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
    return dav.backendAddress + key;
  }

  function doCall(method, key, value, deadLine, callback) {
    var httpObj = url.parse(keyToAddress(key));
    httpObj.method = method;
    httpObj.headers = {Authorization: 'Basic '+ dav.backendToken};
    var req = http.request(options, function(res) {
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

  dav.getUserAddress = function() {
    return dav.backendAddress
  }

  dav.get = function(key, callback) {
    console.log('dav.get("'+key+'", callback);');
    doCall('GET', key, null, function(str) {
      var obj = JSON.parse(str);
      callback(false, obj.value);
    }
  }

  dav.set = function(key, value, callback) {
    console.log('dav.set("'+key+'", "'+value+'", callback);');
    var obj = {
      value: value
    };
    doCall('PUT', key, JSON.stringify(obj), callback);
  }
 
  dav.remove = function(key, callback) {
    console.log('dav.remove("'+key+'", callback);');
    doCall('DELETE', key, null, callback);
  } 
  return dav
}

exports.remoteDAV = remoteDAV;
