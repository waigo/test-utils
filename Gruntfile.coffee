module.exports = (grunt) ->
  require('matchdep').filterDev('grunt-*').forEach (contrib) ->
    grunt.loadNpmTasks contrib

  grunt.initConfig
    jshint:
      options:
        jshintrc: true
      all: ['index.js']

    mochaTest:
      test:
        options:
          ui: 'exports'
          reporter: 'spec'
        src: [
          '<%= config.test %>/test.js'
        ]

  grunt.registerTask "default", ["jshint"]
  
