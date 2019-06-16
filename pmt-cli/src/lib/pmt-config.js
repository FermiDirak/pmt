const process = require('process');
const chalk = require('chalk');
const User = require('./../datastructures/user');

/** Prints a user config to stdout
 * @param {User} the user to print to stdout */
const printUserConfig = (user) => {
  process.stdout.write(chalk.blue('User config:\n'));

  Object.entries(user).forEach(([key, value]) => {
    process.stdout.write(`  [${key}]: ${value}\n`);
  });
};

const pmtConfig = async () => {
  const user = await User.readUser();
  printUserConfig(user);
};

module.exports = pmtConfig;
