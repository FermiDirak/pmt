// const fs = require('fs');
// const path = require('path');


// /** Gets the repository's git history */
// const getGitHistory = async () => {
//   const gitDirectory = await getGitDirectory();
//   const repo = await Git.Repository.open(gitDirectory);
//   const firstCommitOnMaster = await repo.getMasterCommit();
//   const history = await firstCommitOnMaster.history();

//   return history;
// };


// /** gets a list of branches in the current repository
//  * @return {Array<string>} A list of branch names */
// const getBranchesList = async () => {
//   const gitDirectory = getGitDirectory();
//   const repository = await Git.Repository.open(gitDirectory);
//   const references = (await Git.Reference.list(repository))
//     .filter(reference => !!reference.match(/refs\/head/g));

//   return references.map((reference) => {
//     const branchName = reference.split('/');
//     return branchName.splice(2).join('/');
//   });
// };

// /** fetches master branch */
// const fetchMaster = async () => {
//   const gitDirectory = await getGitDirectory();
//   const repo = await Git.Repository.open(gitDirectory);

//   await repo.fetch('origin', {
//     callbacks: {
//       credentials(url, userName) {
//         return Git.Cred.sshKeyFromAgent(userName);
//       },
//     },
//   });
// };

// /** Creates a branch with the given branch name based off origin HEAD
//  * @param branchName The branchName to give the new branch */
// const createBranch = async (branchName) => {
//   await fetchMaster();

//   const gitDirectory = await getGitDirectory();
//   const repo = await Git.Repository.open(gitDirectory);
//   const headCommit = await repo.getHeadCommit();

//   repo.createBranch(branchName, headCommit, false);
// };

module.exports = {
  // getGitHistory,
  // getBranchesList,
  // fetchMaster,
  // createBranch,
};
