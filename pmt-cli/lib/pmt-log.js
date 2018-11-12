
const Git = require('nodegit');
const commitCount = require('git-commit-count');
const chalk = require('chalk');

const io = require('../utils/io');


/** leftpads content by a fixed value and culls left over values
 * @param string The string to left pad
 * @param len The size of the area to fill */
const leftPad = (string, len) => {
  if (string.length < len) {
    return Array(len - string.length).fill(' ').join('') + string;
  }

  return `${string.substring(0, len - 3)}...`;
};


/** formats a commit in a human readable format
 * @param commit The commit to format
 * @return The formatted commit message */
const formatCommit = (commit) => {
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

  return message;
};


/** Creates the log
 * @param history {object} NodeGit commit history
 * @param writeStream {object} The writestream object */
const createLog = (history, writeStream) => new Promise((resolve) => {
  const totalCommitCount = commitCount();
  let count = 0;

  history.on('commit', (commit) => {
    const commitMessage = formatCommit(commit);

    writeStream.write(commitMessage);
    count += 1;

    if (count === totalCommitCount) {
      writeStream.end();
      resolve();
    }
  });

  history.start();
});


/** The logging function of PMT
 * @param options Other option arguments
 * @return Promise whether the transaction has  succeeded or failed */
const pmtLog = (options) => {
  let tempFilePath = null;
  let writeStream = null;

  return io.makeTempFile('pmt', 'logs')
    .then((_tempFilePath) => {
      tempFilePath = _tempFilePath;
      writeStream = io.createWriteStream(_tempFilePath);
    })
    .then(() => io.getGitDirectory())
    .then(gitDirectory => Git.Repository.open(gitDirectory))
    .then(repo => repo.getMasterCommit())
    .then(firstCommitOnMaster => firstCommitOnMaster.history())
    .then(history => createLog(history, writeStream))
    .then(() => {
      io.openFileInReader(tempFilePath);
    });
};


module.exports = pmtLog;
