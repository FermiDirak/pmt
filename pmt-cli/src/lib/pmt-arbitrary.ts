import {spawn} from 'child_process';
import chalk from 'chalk';

/** runs an arbirary Git command */
function pmtArbitrary(args: Array<string>) {
  const command = `git ${args.join(' ')}\n`;
  process.stdout.write(chalk.grey(chalk.italic(command)));

  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      stdio: 'inherit',
      detached: true,
    });

    child.on('close', () => {
      resolve();
    });

    child.on('error', error => {
      reject(error);
    });
  });


}

export default pmtArbitrary;
