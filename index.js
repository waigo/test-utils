"use strict";

const _ = require('lodash'),
  co = require('co'),
  sinon = require('sinon'),
  got = require('got'),
  genomatic = require('genomatic'),
  fs = require('fs'),
  path = require('path'),
  shell = require('shelljs');

require('must/register')
global.expect = require('must')


/**
 * Create a new test object.
 *
 * @param {Object} _this The `this` context for each function.
 * @param {Object} [options] Additional options.
 * @param  {String} [options.dataFolder] Should be path to test data folder. If ommitted then assumed to be at: `process.cwd()/test/data`
 * @param  {Object} [options.extraMethods] Extra methods to add to test object.
 *
 * @return {Object} Test object
 */
function getTools (_this, options) {
  const waigo = _this.waigo

  options = _.extend({
    dataFolder: path.join(process.cwd(), 'test', 'data'),
    appFolder: null,
    publicFolder: null,
    pluginsFolder: null,
    extraDataAndMethods: {}
  }, options);

  const tools = {},
    testDataFolder = path.normalize(options.dataFolder);

  tools.appFolder = options.appFolder || path.join(testDataFolder, 'src');
  tools.publicFolder = options.publicFolder || path.join(testDataFolder, 'public');
  tools.pluginsFolder = options.pluginsFolder || path.join(process.cwd(), 'node_modules');

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
    const dir = path.dirname(filePath);

    tools.createFolder(dir);

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
   * Check if a file exists
   *
   * @param {String} filePath Path to file.
   *
   * @return {Boolean} true if exists, false otherwise
   */
  tools.fileExists = function(filePath) {
    try {
      fs.accessSync(filePath, fs.F_OK);
      return true;
    } catch (err) {
      return false;
    }
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
    tools.createFolder(tools.publicFolder);
    tools.writeFile(path.join(tools.appFolder, 'README'), 'The presence of this file ensures that node-findit works');
  };




  /**
   * Delete test folders.
   */
  tools.deleteTestFolders = function() {
    tools.deleteFolder(tools.publicFolder);
    tools.deleteFolder(tools.appFolder);

    const files = fs.readdirSync(tools.pluginsFolder);

    const plugins = _.filter(files, function(file) {
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

    const pluginFolderPath = path.join(tools.pluginsFolder, name),
      publicFolderPath = path.join(pluginFolderPath, 'public'),
      srcFolderPath = path.join(pluginFolderPath, 'src');

    tools.createFolder(pluginFolderPath);

    tools.writeFile(path.join(pluginFolderPath, 'package.json'), '{ "name": "' + name + '", "version": "0.0.1" }');
    tools.writeFile(path.join(pluginFolderPath, 'index.js'), 'module.exports = {}');

    tools.createFolder(publicFolderPath);
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
        const moduleContent = _.map(modules, function(moduleName) {
          return 'module.exports="' + defaultContent + '";';
        });

        modules = _.zipObject(modules, moduleContent);
      }

      const __createModule = function(moduleName, moduleContent) {
        let extName = path.extname(moduleName);

        if (!extName.length) {
          extName = '.js';
        }

        const fileName = path.join(srcFolder, moduleName) + extName,
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
    const fp = path.join(tools.appFolder, '..', 'package.json');

    shell.rm('-f', fp);
  };



  tools.initApp = function*(initOptions) {
    waigo.reset();

    yield waigo.init(_.extend({
      appFolder: this.appFolder,
    }, initOptions));

    waigo.App = this.App = new (waigo.load('application'));
  };



  tools.startApp = function*(config) {
    config = _.extend({
      port: 33211,
      baseURL: 'http://localhost:33211',
      logging: {
        appenders: []
      },
      db: {
        main: {
          type: 'rethinkdb',
          serverConfig: {
            db: 'waigo_test',
            servers: [
              {
                host: '127.0.0.1',
                port: 28015,
              },
            ],
          },
        },
      },
    }, config);

    yield this.App.start({
      postConfig: (cfg) => {
        _.extend(cfg, config);
      },
    });
  };



  tools.shutdownApp = function*() {
    if (this.App) {
      yield this.App.shutdown();
    }
  };



  tools.fetch = function(url, options) {
    if ('/' !== url.charAt(0)) {
      url = `/${url}`;
    }

    return got(this.App.config.baseURL + url, options);
  };


  /**
   * Wrap given generation function and/or Promise in a Promise.
   *
   * This is useful for testing the results of async calls elegantly using an
   * assertion library.
   *
   * @param  {*} genOrPromiseFn
   * @return {Promise}
   */
  tools.awaitAsync = function (genOrPromiseFn) {
    return co(function *() {
      return yield genOrPromiseFn
    })
  }


  /**
   * Check that given generator function or promise throws given error.
   *
   * @param  {*} genOrPromiseFn
   * @return {Promise}
   */
  tools.mustThrow = function *(genOrPromiseFn, errorMsg) {
    yield tools.awaitAsync(genOrPromiseFn).must.reject.with.error(errorMsg)
  }

  return tools;
};


exports.mocha = function(_module, waigo, options) {
  options = options || {}

  const tests = {};

  _module.exports[options.name || path.basename(_module.filename)] = {
    beforeEach: function() {
      this.mocker = sinon.sandbox.create();
      this.waigo = waigo
      _.extend(this, getTools(this, options));
    },
    afterEach: function() {
      this.mocker.restore();
    },
    tests: tests,
  };

  return tests;
};



exports.ava = function(avaTest, waigo, options) {
  options = options || {}

  avaTest.beforeEach(function(t) {
    t.context.waigo = waigo
    t.context.mocker = sinon.sandbox.create();
    _.extend(t.context, getTools(t.context, options));
  });

  avaTest.afterEach(function(t) {
    t.context.mocker.restore();
  });

  return avaTest;
};
