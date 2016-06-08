var sh = require('shelljs');

sh.set('-e');

sh.pushd('tests/integration/app');
// ensure installation has been run once for the testbed app
sh.test('-d', 'node_modules') && sh.test('-d', 'node_modules/sails') && sh.test('-d', 'node_modules/sails-mysql-transactions') || sh.exec('npm install');

// symlink codebase
sh.pushd('node_modules/sails-mysql-transactions');
if (sh.test('-d', 'lib') && !sh.test('-L', 'lib')) {
	!sh.test('-d', '_lib') && sh.mv('lib', '_lib');
	sh.test('-d', 'lib') && sh.rm('-rf', 'lib');
}

!sh.test('-L', 'lib') && sh.ln('-fs', '../../../../../lib');
sh.popd();

// symlink waterline submodule
sh.pushd('node_modules/sails/node_modules');
if (sh.test('-d', 'waterline') && !sh.test('-L', 'waterline')) {
	!sh.test('-d', 'waterline') && sh.mv('waterline', '_waterline');
	sh.test('-d', 'waterline') && sh.rm('-rf', 'waterline');
}

!sh.test('-L', 'waterline') && sh.ln('-fs', '../../../../../../waterline');

sh.popd();
sh.popd();
