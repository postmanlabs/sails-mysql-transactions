var sh = require('shelljs'),
    INTEGRATION_APP_DIR = 'tests/integration/app'; // location of integration test server

sh.set('-e');

// ===========================================================
sh.echo('Starting integration test server...');
sh.pushd(INTEGRATION_APP_DIR);

if(sh.env['CI'] == true) {
  sh.echo();
  sh.echo("travis_fold:start:integration.npm.install");
}

if(!sh.test('-d', 'node_modules')) {
  sh.exec('npm install -d');
}
else {
  if (sh.test('-d', 'node_modules/sails-mysql-transactions')) {
    sh.rm('-rf', 'node_modules/sails-mysql-transactions');
  }
	sh.exec('npm run postinstall');
}

if(sh.env['CI'] == true) {
  sh.echo();
  sh.echo('travis_fold:end:integration.npm.install');
}

sh.exec('npm start');
sh.popd();
// ===========================================================

// Do other tests while giving time for server to start
sh.echo('jscs v`jscs --version`');
sh.exec('jscs lib tests/unit');

sh.echo();

sh.exec('jshint --version');
sh.exec('jshint lib tests/unit');
sh.echo('No code lint issues found.');

sh.echo();
sh.echo('Running unit tests...');
sh.echo('mocha v`mocha --version`');

sh.exec('mocha tests/unit/**/*-spec.js');

// ===========================================================
sh.echo();
sh.echo('Running integration tests...');

// execute newman
// server should be up and running on localhost:1337
sh.exec('newman -s -c tests/integration/sanity.json.postman_collection \
       -e tests/integration/sails-transactions-experiment.postman_environment');

sh.pushd(INTEGRATION_APP_DIR);
sh.exec('npm stop');
sh.popd();
// ===========================================================
