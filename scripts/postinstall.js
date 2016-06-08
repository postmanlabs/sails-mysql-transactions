var sh = require('shelljs'),
    INFO = 'sails-mysql-transactions:', // for console logs;
    MOD_DIR = '../../node_modules';

sh.set('-e');

// If this is an NPM installation, we do not expect `.gitmodules` in the directory
// since it is ignored by `.npmignore`. This is a fairly robust check to test whether
// this script has been run as part of npm install or as part of self install.
if (sh.test('-f', '.gitmodules')) {
  sh.echo(`${INFO} Not an NPM install, exiting waterline injection.`);
  sh.exit(0);
}

// Check whether sails has been already installed or not. If not, this is an
// error and we should not proceed.
if (!sh.test('-d', `${MOD_DIR}/sails`)) {
  sh.echo(sh.test('-e', '\033[1;31m'));
  sh.echo(`${INFO} Sails installation not found!`);
  sh.echo(`${INFO} Ensure your package.json, which has sails-mysql-transaction, also includes sails.`);
  sh.echo(sh.test('-e', '\033[0m\n'));
  sh.exit(1);
}

if (sh.test('-d', `${MOD_DIR}/sails-mysql`)) {
  sh.echo(sh.test('-e', '\033[1;31m'));
  sh.echo(`${INFO} WARNING - detected sails-mysql.`);
  sh.echo(`${INFO} You may face unexpected behaviour.`);
  sh.echo(`${INFO} Preferably remove sails-mysql from packages before using this in production.`);
  sh.echo(sh.test('-e', '\033[0m\n'));
}

sh.echo(`${INFO} Injecting waterline...`);

sh.pushd(`${MOD_DIR}/sails`);
sh.exec(`npm remove waterline`);
sh.exec(`npm install ${MOD_DIR}/sails-mysql-transactions/waterline`);
sh.popd();

sh.echo();
sh.echo(`${INFO} Installation successful.`);
sh.echo();
