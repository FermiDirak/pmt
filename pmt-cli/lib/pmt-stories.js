const Git = require('nodegit');
const io = require('../utils/io');

class StoryInformation {
  constructor(branchName) {
    this.id = branchName;
  }
}

/** formats a list of stories for std output
 * @param stories {Array<string>} A list of stories
 * @return string The formatted string to output */
const formatStories = (stories) => {
  let message = '';

  stories.forEach((story) => {
    message += `  * ${story.id}\n`;
  });

  process.stdout.write(message);
};


/** printes stories in a list format */
const pmtStories = () => io.getGitDirectory()
  .then(gitDirectory => Git.Repository.open(gitDirectory))
  .then(repo => Git.Reference.list(repo))
  .then(refs => refs.filter(ref => !!ref.match(/refs\/heads/g)))
  .then(refs => refs.map((ref) => {
    const branchName = ref.split('/');
    branchName.shift();
    branchName.shift();

    return new StoryInformation(branchName.join('/'));
  }))
  .then((stories) => { formatStories(stories); });

module.exports = pmtStories;
