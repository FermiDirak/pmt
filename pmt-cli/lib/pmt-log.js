const fs = require('fs');
const commitCount = require('git-commit-count');
const chalk = require('chalk');

const git = require('../utils/git');
const io = require('../utils/io');

/** formats a commit in a human readable format
 * @param commit The commit to format
 * @return {string} The formatted commit message */
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
    `[${chalk.blue(sha)}]  ${email.padStart(24)}   ${date}`,
    `${body}`,
    '',
  ].join('\n');

  return message;
};

/** pmt's equivalent for git log but decorated for stories */
const pmtLog = async () => {
  const tempFilePath = await io.makeTempFile('pmt', 'log');
  const history = await git.getGitHistory();
  const writeStream = fs.createWriteStream(tempFilePath, { options: ['a'] });


  const totalCommitCount = commitCount();
  let count = 0;

  // write git history to temp file
  history.on('commit', (commit) => {
    const commitMessage = formatCommit(commit);
    count += 1;

    writeStream.write(commitMessage);

    if (count === totalCommitCount) {
      writeStream.end();
    }
  });

  history.start();

  setTimeout(() => {
    io.openFileInReader(tempFilePath);
  }, 100);
};

module.exports = pmtLog;
