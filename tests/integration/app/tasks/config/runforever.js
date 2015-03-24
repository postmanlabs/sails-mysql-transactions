/**
 * Run server
 *
 * ---------------------------------------------------------------
 */
module.exports = function(grunt) {

	grunt.config.set('forever', {
    server: {
      options: {
        index: 'app.js',
        logDir: 'logs'
      }
    }
	});

	grunt.loadNpmTasks('grunt-forever');
};
