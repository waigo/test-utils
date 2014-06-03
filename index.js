var _ = require('lodash'),
  co = require('co'),
  mkdirp = require('mkdirp'),
  sinon = require('sinon'),
  chai = require("chai"),
  fs = require('fs'),
  path = require('path'),
  Promise = require('bluebird'),
  rimraf = require('rimraf');


chai.use(require('sinon-chai'));
chai.use(require("chai-as-promised"));


fs = Promise.promisifyAll(fs);
fs.existsAsync = Promise.promisify(function(file, cb) {
  fs.exists(file, function(exists) {
    cb(null, exists);
  });
});


var rimrafAsync = Promise.promisify(rimraf);
var mkdirpAsync = Promise.promisify(mkdirp);


/** 
 * Create a new test object.
 * @param  {Object} _module  Should be __module
 * @param  {String} _dataFolder Should be path to test data folder. If ommitted then assumed to be at: `process.cwd()/test/data`
 * @return {Object} Test object
 */
module.exports = function(_module, _dataFolder) {

  if (!_dataFolder) {
    _dataFolder = path.join(process.cwd(), 'test', 'data');
  }

  var testUtils = {},
    testDataFolder = path.normalize(_dataFolder);

  testUtils.appFolder = path.join(testDataFolder, 'app');
  testUtils.pluginsFolder = path.join(process.cwd(), 'node_modules');


  /**
   * Get whether given function is a generator function.
   * @return {boolean} true if so; false otherwise
   */
  testUtils.isGeneratorFunction = function(obj) {
    return obj && obj.constructor && 'GeneratorFunction' === obj.constructor.name;
  };




  /**
   * Spawn a Bluebird + co coroutine around given generator function.
   * @return {Function} Function which returns a Promise.
   */
  testUtils.spawn = function(generatorFunction, thisObject, arg1) {
    var args = _.toArray(arguments).slice(2);
    
    return Promise.promisify(co(function*() {
      return yield generatorFunction.apply(thisObject, args);
    }))();
  };





  /**
   * Write a file.
   *
   * @param {String} filePath Path to file.
   * @param {String} contents File contents
   * 
   * @return {Promise}
   */
  testUtils.writeFile = function(filePath, contents) {
    return fs.writeFileAsync(filePath, contents);
  };



  /**
   * Read a file.
   *
   * @param {String} filePath Path to file.
   * 
   * @return {Promise}
   */
  testUtils.readFile = function(filePath) {
    return fs.readFileAsync(filePath, { encoding: 'utf8' })
      .then(function(contents) {
        return contents.toString();
      });
  };




  /**
   * Create a folder and its intermediate folders.
   *
   * @param {String} folder Folder to create.
   * 
   * @return {Promise}
   */
  testUtils.createFolder = function(folder) {
    return mkdirpAsync(folder);
  };



  /**
   * Delete a folder.
   *
   * @param {String} folder Folder to delete
   * 
   * @return {Promise}
   */
  testUtils.deleteFolder = function(folder) {
    return rimrafAsync(folder);
  };




  /**
   * Create test folders.
   *
   * @return {Promise}
   */
  testUtils.createTestFolders = function() {
    /*
    node-findit fails to finish for empty directories, so we create dummy files to prevent this
    https://github.com/substack/node-findit/pull/26
     */
    return testUtils.createFolder(testUtils.appFolder)
      .then(function() {
        return testUtils.writeFile(path.join(testUtils.appFolder, 'README'), 'The presence of this file ensures that node-findit works');
      });
  };




  /**
   * Delete test folders.
   *
   * @return {Promise}
   */
  testUtils.deleteTestFolders = function() {
    return testUtils.deleteFolder(testUtils.appFolder)
      .then(function() {
        return fs.readdirAsync(testUtils.pluginsFolder)
          .then(function deletePlugins(files) {
            var plugins = _.filter(files, function(file) {
              return file.endsWith('_TESTPLUGIN');
            });
            return Promise.all(
              _.map(plugins, function(plugin) {
                return testUtils.deleteFolder(path.join(testUtils.pluginsFolder, plugin));
              })
            );
          });
      });
  };






  /**
   * Create modules within given test plugin.
   *
   * The content of each created module will be a string containing the plugin name.
   *
   * @param name {String} name of plugin to create. Should be suffixed with '_TESTPLUGIN';
   * @param [modules] {Array|Object} CommonJS modules to create within the plugin.
   *
   * @return {Promise}
   */
  testUtils.createPluginModules = function(name, modules) {
    if (!name.endsWith('_TESTPLUGIN')) {
      throw new Error('Test plugin name has incorrect suffix');
    }

    var pluginFolderPath = path.join(testUtils.pluginsFolder, name),
      srcFolderPath = path.join(pluginFolderPath, 'src');

    return testUtils.createFolder(pluginFolderPath)
      .then(function() {
        return Promise.all([
          testUtils.writeFile(path.join(pluginFolderPath, 'package.json'), '{ "name": "' + name + '", "version": "0.0.1" }'),
          testUtils.writeFile(path.join(pluginFolderPath, 'index.js'), 'module.exports = {}')
        ]);
      })
      .then(function createPluginSrcFolder() {
        return testUtils.createFolder(srcFolderPath);
      })
      .then(function createPluginSrcFolder(exists) {
        return testUtils.writeFile(path.join(srcFolderPath, 'README'), 'The presence of this file ensures that node-findit works');
      })
      .then(function createModules() {
        return testUtils.createModules(srcFolderPath, modules, name);
      });
  };




  /**
   * Create modules in the app folder tree.
   *
   * @param [modules] {Array|Object} CommonJS modules to create within the app.
   *
   * @return {Promise}
   */
  testUtils.createAppModules = function(modules) {
    return testUtils.createModules(testUtils.appFolder, modules, 'app');
  };






  /**
   * Create modules.
   *
   * @param srcFolder {String} folder in which to create the module. Expected to exist.
   * @param modules {Object|Array} CommonJS modules to create.
   * @param defaultContent {String} the default content to use for a module if none provided.
   *
   * @return {Promise}
   */
  testUtils.createModules = function(srcFolder, modules, defaultContent) {
    var promise = Promise.resolve();

    if (modules) {
      // if an array then generate default module content
      if (_.isArray(modules)) {
        var moduleContent = _.map(modules, function(moduleName) {
          return 'module.exports="' + defaultContent + '";';
        });

        modules = _.zipObject(modules, moduleContent);
      }

      var __createModule = function(moduleName, moduleContent) {
        var fileName = path.join(srcFolder, moduleName) + '.js',
          folderPath = path.dirname(fileName);

        return testUtils.createFolder(folderPath)
          .then(function createModuleFile() {
            return testUtils.writeFile(fileName, moduleContent);
          });
      };

      // sequentially create each module - this avoids conflicting async calls to mkdir() for the same folder
      _.each(modules, function(moduleContent, moduleName) {
        promise = promise.then(function() {
          return __createModule(moduleName, modules[moduleName]);
        });
      });

    } // if modules set

    return promise;
  };



  /**
   * Write test package.json file.
   * @param  {String} contents File contents.
   * @return {Promise}
   */
  testUtils.writePackageJson = function(contents) {
    return testUtils.writeFile(
      path.join(testUtils.appFolder, '..', 'package.json'),
      contents
    );
  };



  /**
   * Delete test package.json file.
   * @return {Promise}
   */
  testUtils.deletePackageJson = function() {
    var fp = path.join(testUtils.appFolder, '..', 'package.json');

    return fs.existsAsync(fp)
      .then(function(exists){
        if (exists) {
          return fs.unlinkAsync(fp);
        }
      });
  };








  var utils = _.extend({}, testUtils, {
    assert: chai.assert,
    expect: chai.expect,
    should: chai.should()
  });

  var test = _.extend({}, {
    beforeEach: function() {
      test.mocker = sinon.sandbox.create();
    },

    afterEach: function() {
      test.mocker.restore();
    }
  });

  _module.exports[path.basename(_module.filename)] = test;

  return { test: test, utils: utils };
};



