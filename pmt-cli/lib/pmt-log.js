const Git = require('nodegit');
const chalk = require('chalk');

/** leftpads content by a fixed value and culls left over values
 * @param string The string to left pad
 * @param len The size of the area to fill
 */
const leftPad = (string, len) => {
  if (string.length < len) {
    return Array(len - string.length).fill(' ').join('') + string;
  }

  return string.substring(0, len - 3) + '...';
}


/** formats a commit in a human readable format
 * @param commit The commit to format
 * @return The formatted commit message
 */
const formatCommit = (commit) => {
  //@todo
  let message = '';

  let sha = commit.sha();
  sha = sha.slice(sha.length - 6, sha.length);

  const email = commit.author().email();

  let date = commit.date().toDateString().split(' ');
  date.shift();
  date = date.join(' ');

  let body = commit.message();
  body = body.split('\n').map(line => `  ${line}`).join('\n');


  message += [
    `[${chalk.blue(sha)}]  ${leftPad(email, 24)}   ${date}`,
    `${body}`,
    '',
  ].join('\n');

  // message += commit.hash() + '\n';

  return message;
}

/** The logging function of PMT
 * @param currentDirectory The current working directory
 * @param options Other option arguments
 * @return Promise whether the transaction has  succeeded or failed
 */
const pmtLog = (currentDirectory, options) => {
  let logs = '';

  Git.Repository.open(currentDirectory)
  .then(repo => {
    return repo.getMasterCommit();
  })
  .then(firstCommitOnMaster => {
    let history = firstCommitOnMaster.history();

    history.on('commit', commit => {
      logs += formatCommit(commit);

      console.log(formatCommit(commit));
    });

    history.start();
  })
  .catch(error => {
    prettyDebug.printError(error);
    process.exit(1);
  });


}

module.exports = pmtLog;