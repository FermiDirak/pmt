const Git = require('nodegit');
const io = require('../utils/io');

const Story = require('../datastructures/story');

/** gets a list of branches called branhes in the current repository
 * @return {Array<string>} A list of branch names
 */
const getBranchesList = () => io.getGitDirectory()
.then(gitDirectory => Git.Repository.open(gitDirectory))
.then(repo => Git.Reference.list(repo))
.then(refs => refs.filter(ref => !!ref.match(/refs\/heads/g)))
.then(refs => refs.map((ref) => {
  const branchName = ref.split('/');
  branchName.shift();
  branchName.shift();

  return new Story(branchName.join('/'));
}));

module.exports = {
  getBranchesList,
}