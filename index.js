// enable Mocha test functions to be generators
require('co-mocha');

const _ = require('lodash'),
  co = require('co'),
  sinon = require('sinon'),
  genomatic = require('genomatic'),
  chai = require("chai"),
  fs = require('fs'),
  path = require('path'),
  Q = require('bluebird'),
  shell = require('shelljs');

chai.use(require('sinon-chai'));
chai.use(require("chai-as-promised"));



/** 
 * Create a new test object.
 * 
 * @param  {Object} _module  Should be `module` of test file.
 * @param {Object} [options] Additional options.
 * @param  {String} [options.dataFolder] Should be path to test data folder. If ommitted then assumed to be at: `process.cwd()/test/data`
 * @param  {Object} [options.extraMethods] Extra methods to add to test object.
 * 
 * @return {Object} Test object
 */
exports.create = function(_module, options) {
  options = _.extend({
    dataFolder: path.join(process.cwd(), 'test', 'data'),
    extraDataAndMethods: {}
  }, options);
  
  var tools = {},
    testDataFolder = path.normalize(options.dataFolder);

  tools.appFolder = path.join(testDataFolder, 'app');
  tools.pluginsFolder = path.join(process.cwd(), 'node_modules');

  /**
   * Generator utility methods.
   */
  _.extend(tools, genomatic);

  /**
   * Write a file.
   *
   * @param {String} filePath Path to file.
   * @param {String} contents File contents
   */
  tools.writeFile = function(filePath, contents) {
    fs.writeFileSync(filePath, contents);
  };



  /**
   * Read a file.
   *
   * @param {String} filePath Path to file.
   */
  tools.readFile = function(filePath) {
    return fs.readFileSync(filePath, { encoding: 'utf8' }).toString();
  };




  /**
   * Delete a file.
   *
   * @param {String} filePath Path to file.
   */
  tools.deleteFile = function(filePath) {
    fs.unlinkSync(filePath);
  };





  /**
   * Chmod a file.
   *
   * @param {String} filePath Path to file.
   * @param {String} mode The chmod mode to set.
   */
  tools.chmodFile = function(filePath, mode) {
    fs.chmodSync(filePath, mode);
  };




  /**
   * Create a folder and its intermediate folders.
   *
   * @param {String} folder Folder to create.
   * 
   * @return {Promise}
   */
  tools.createFolder = function(folder) {
    shell.mkdir('-p', folder);
  };



  /**
   * Delete a folder.
   *
   * @param {String} folder Folder to delete
   * 
   * @return {Promise}
   */
  tools.deleteFolder = function(folder) {
    shell.rm('-rf', folder);
  };




  /**
   * Create test folders.
   */
  tools.createTestFolders = function() {
    /*
    node-findit fails to finish for empty directories, so we create dummy files to prevent this
    https://github.com/substack/node-findit/pull/26
     */
    tools.createFolder(tools.appFolder);
    tools.writeFile(path.join(tools.appFolder, 'README'), 'The presence of this file ensures that node-findit works');
  };




  /**
   * Delete test folders.
   */
  tools.deleteTestFolders = function() {
    tools.deleteFolder(tools.appFolder);

    let files = fs.readdirSync(tools.pluginsFolder);

    let plugins = _.filter(files, function(file) {
      return file.endsWith('_TESTPLUGIN');
    });

    _.each(plugins, function(plugin) {
      tools.deleteFolder(path.join(tools.pluginsFolder, plugin));
    })
  };






  /**
   * Create modules within given test plugin.
   *
   * The content of each created module will be a string containing the plugin name.
   *
   * @param name {String} name of plugin to create. Should be suffixed with '_TESTPLUGIN';
   * @param [modules] {Array|Object} CommonJS modules to create within the plugin.
   */
  tools.createPluginModules = function(name, modules) {
    if (!name.endsWith('_TESTPLUGIN')) {
      throw new Error('Test plugin name has incorrect suffix');
    }

    var pluginFolderPath = path.join(tools.pluginsFolder, name),
      srcFolderPath = path.join(pluginFolderPath, 'src');

    tools.createFolder(pluginFolderPath);

    tools.writeFile(path.join(pluginFolderPath, 'package.json'), '{ "name": "' + name + '", "version": "0.0.1" }');
    tools.writeFile(path.join(pluginFolderPath, 'index.js'), 'module.exports = {}');

    tools.createFolder(srcFolderPath);

    tools.writeFile(path.join(srcFolderPath, 'README'), 'The presence of this file ensures that node-findit works');

    tools.createModules(srcFolderPath, modules, name);
  };




  /**
   * Create modules in the app folder tree.
   *
   * @param [modules] {Array|Object} CommonJS modules to create within the app.
   */
  tools.createAppModules = function(modules) {
    tools.createModules(tools.appFolder, modules, 'app');
  };






  /**
   * Create modules.
   *
   * @param srcFolder {String} folder in which to create the module. Expected to exist.
   * @param modules {Object|Array} CommonJS modules to create.
   * @param defaultContent {String} the default content to use for a module if none provided.
   */
  tools.createModules = function(srcFolder, modules, defaultContent) {
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

        tools.createFolder(folderPath);

        tools.writeFile(fileName, moduleContent);
      };

      // sequentially create each module - this avoids conflicting async calls to mkdir() for the same folder
      _.each(modules, function(moduleContent, moduleName) {
        __createModule(moduleName, modules[moduleName]);
      });

    } // if modules set
  };



  /**
   * Write test package.json file.
   * @param  {String} contents File contents.
   */
  tools.writePackageJson = function(contents) {
    tools.writeFile(
      path.join(tools.appFolder, '..', 'package.json'),
      contents
    );
  };



  /**
   * Delete test package.json file.
   */
  tools.deletePackageJson = function() {
    var fp = path.join(tools.appFolder, '..', 'package.json');

    shell.rm('-f', fp);
  };


  const tests = {};


  _addDataAndMethods = function(_this, _obj) {
    for (let k in _obj) {
      _this[k] = _.isFunction(_obj[k]) 
        ? genomatic.bind(_obj[k], this)
        : _obj[k];
    }
  }


  _module.exports[path.basename(_module.filename)] = _.extend({}, {
    beforeEach: function() {
      test.mocker = sinon.sandbox.create();

      this.assert = chai.assert;
      this.expect = chai.expect;
      this.should = chai.should();

      _addDataAndMethods(this, tools);
      _addDataAndMethods(this, options.extraDataAndMethods);
    },

    afterEach: function() {
      test.mocker.restore();
    },
    tests: tests,
  });

  return tests;
};



