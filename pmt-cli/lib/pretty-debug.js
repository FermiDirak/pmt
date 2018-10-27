const chalk = require('chalk');

/** logs a command in a pretty way
 * @param command The command being ran
 * @param param The param associated with the command
 * @param options The options being passed in with the command
 */
const printCommand = (command, param, ...options) => {
  let formattedOptions = '';

  options.forEach(option => {
    if (option[1]) {
      formattedOptions += `${option[0]} ${chalk.yellow(option[1])}`;
    }
  });

  console.log(
    `Just ran: pmt ${command} ${chalk.magenta(param)} ${formattedOptions}`
  );
}

module.exports = {
  printCommand,
};