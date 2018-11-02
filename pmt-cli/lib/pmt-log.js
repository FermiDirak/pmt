const Git = require('nodegit');

/** formats a commit in a human readable format
 * @param commit The commit to format
 * @return The formatted commit message
 */
const formatCommit = (commit) => {
  //@todo

  return '';
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
    });

    history.start();
  })
  .catch(error => {
    prettyDebug.printError(error);
    process.exit(1);
  });


}

module.exports = pmtLog;