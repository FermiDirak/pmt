const fs = require('fs');
const path = require('path');
const Git = require('nodegit');


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
  const references = (await Git.Reference.list(repository))
    .filter(reference => !!reference.match(/refs\/head/g));

  return references.map((reference) => {
    const branchName = reference.split('/');
    return branchName.splice(2).join('/');
  });
};

/** fetches master branch */
const fetchMaster = async () => {
  const gitDirectory = await getGitDirectory();
  const repo = await Git.Repository.open(gitDirectory);

  await repo.fetch('origin', {
    callbacks: {
      credentials(url, userName) {
        return Git.Cred.sshKeyFromAgent(userName);
      },
    },
  });
};

/** Creates a branch with the given branch name based off origin HEAD
 * @param branchName The branchName to give the new branch */
const createBranch = async (branchName) => {
  await fetchMaster();

  const gitDirectory = await getGitDirectory();
  const repo = await Git.Repository.open(gitDirectory);
  const headCommit = await repo.getHeadCommit();

  repo.createBranch(branchName, headCommit, false);
};

module.exports = {
  getGitDirectory,
  getBranchesList,
  fetchMaster,
  createBranch,
};
