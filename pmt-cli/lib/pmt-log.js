const { promisify } = require('util');

const os = require('os');
const path = require('path');
const fs = require('fs');

const mkdtemp = promisify(fs.mkdtemp);
const writeFile = promisify(fs.writeFile);

const { spawn } = require('child_process');

const Git = require('nodegit');
const commitCount = require('git-commit-count');
const chalk = require('chalk');

const io = require('../utils/io');

/** The logging function of PMT
 * @param options Other option arguments
 * @return Promise whether the transaction has  succeeded or failed
 */
const pmtLog = (options) => {
  const totalCommitCount = commitCount();
  const count = 0;

  let tempFilePath = null;

  return io.makeTempFile('pmt', 'logs')
    .then((_tempFilePath) => {
      tempFilePath = _tempFilePath;
    })
    .then(() => io.getGitDirectory())
    .then(gitDirectory => Git.Repository.open(gitDirectory))
    .then(repo => repo.getMasterCommit())
    .then((firstCommitOnMaster) => {
      console.log(tempFilePath);

      console.log(firstCommitOnMaster);
    });


  //   .then((firstCommitOnMaster) => {
  //     const history = firstCommitOnMaster.history();

  //     history.on('commit', (commit) => {
  //       const log = formatCommit(commit);
  //       count += 1;


  //       if (count === totalCommitCount) {

  //       }
  //     });

  //     history.start();
  //   })
  //   .then(() => {
  //     console.log(log);

  //     // return writeAndOpen(log);
  //   });


  const writeAndOpen = () => fs.mkdtemp(path.join(os.tmpdir(), 'pmt'))
    .then((folder) => {
      console.log('folder: ', folder);

      // writeFile(f)
    })


    // fs.writeFileSync(tmpFileLocation, log, (error) => {
    //   console.error(error);
    // });

    // const editor = process.env.editor || 'less';

    // spawn(editor, [tmpFileLocation], {
    //   stdio: 'inherit',
    // });
  ;
};


/** open a temp file */
const openTempFile = () => {

};


/** formats a commit in a human readable format
 * @param commit The commit to format
 * @return The formatted commit message
 */
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


/** leftpads content by a fixed value and culls left over values
 * @param string The string to left pad
 * @param len The size of the area to fill
 */
const leftPad = (string, len) => {
  if (string.length < len) {
    return Array(len - string.length).fill(' ').join('') + string;
  }

  return `${string.substring(0, len - 3)}...`;
};


module.exports = pmtLog;
