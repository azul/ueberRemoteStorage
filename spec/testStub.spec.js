describe('ueberRemoteStorage with testStub', function () {

  var ueberRemoteStorage = require('../CloneAndAtomicLayer');
  var async = require("async");

  var settings = { storageApi: 'testStub' }

  describe('new', function () {
    it("stores the settings", function() {
      var storage = new ueberRemoteStorage.remote(settings.storageApi, settings);
      expect(storage.backendSettings).toEqual(settings)
    });
  });

  describe('init', function () {
    it("returns null and the storage for a successful init", function() {
      var storage = new ueberRemoteStorage.remote(settings.storageApi, settings);
      expect(typeof storage.init).toEqual("function");
      storage.init(function(err, storage) {
        expect(err).toBeFalsy();
        expect(storage.settings).toEqual(settings);
      });
      storage.close(function(err) {
        expect(err).toBeFalsy();
      });
    });

    it("returns error and reason on invalid input", function() {
      var storage = new ueberRemoteStorage.remote(settings.storageApi, {invalid: true});
      expect(typeof storage.init).toEqual("function");
      storage.init(function(err, message) {
        expect(err).not.toBeNull();
        expect(message.reason).not.toBeNull();
      });
      storage.close(function(err) {
        expect(err).toBeFalsy();
      });
    });
  });

  describe("set and get", function() {
    var storage = new ueberRemoteStorage.remote(settings.storageApi, settings);
    
    it("can get what it just set", function() {
      var testObj = {dis: 'is', just: 'a-test'};
      async.series([
        function(callback) {
          storage.init(callback);
        },
        function(callback) {
          storage.set("test", testObj, callback);
        },
        function(callback) {
          storage.get("test", function(err, value) {
            expect(err).toBeFalsy();
            expect(value).toEqual(testObj);
            callback();
          });
        }],
        function(callback) {
          storage.close(callback);
      });
    });
  });
});
