const path = require('path');
const fs = require('fs');

const Git = require('nodegit');
const io = require('../utils/io');

/** Returns the path of the .git/ directory
 * @return the .git directory path */
const getGitDirectory = () => {
  const currentDirectory = process.cwd();
  const splitPath = [path.sep, ...currentDirectory.split(path.sep)];

  // recursively traverse up folder structure to find .git directory
  while (splitPath.length >= 1) {
    const gitDir = path.join(...splitPath, '.git');
    if (fs.existsSync(gitDir)) {
      return gitDir;
    }

    splitPath.pop();
  }

  throw new Error('not a git repository (no .git)');
};

/** gets a list of branches in the current repository
 * @return {Array<string>} A list of branch names */
const getBranchesList = async () => {
  const gitDirectory = getGitDirectory();
  const repository = await Git.Repository.open(gitDirectory);
  const references = await Git.Reference.list(repository)
    .filter(reference => !!reference.match(/refs\/head/g));

  return references.map((reference) => {
    const branchName = reference.split('/');
    return branchName.splice(2).join('/');
  });
};

/** Creates a branch with the given branch name based off HEAD
 * @param branchName The branchName to give the new branch */
const createBranch = (branchName) => {
  let repo = null;

  return io.getGitDirectory()
    .then(gitDirectory => Git.repository.open(gitDirectory))
    .then((_repo) => {
      repo = _repo;

      return _repo.getHeadCommit();
    })
    .then(headCommit => repo.createBranch(branchName, headCommit, false));
};

module.exports = {
  getBranchesList,
  createBranch,
  getGitDirectory,
};
