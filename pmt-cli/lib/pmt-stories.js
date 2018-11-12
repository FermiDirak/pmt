const Git = require('nodegit');
const io = require('../utils/io');

const pmtStories = () => {
  console.log('these are your stories:');

  return io.getGitDirectory()
    .then(gitDirectory => Git.Repository.open(gitDirectory))
    .then(repo => Git.Reference.list(repo))
    .then(refs => refs.filter(ref => !!ref.match(/refs\/heads/g)))
    .then(refs => refs.map((ref) => {
      const branchName = ref.split('/');
      branchName.shift();
      branchName.shift();

      return branchName.join('/');
    }))
    .then((branchNames) => {
      branchNames.forEach(branch => console.log(branch));
    });

  // @TODO: read from stories if the branch has a description associated
};

module.exports = pmtStories;
