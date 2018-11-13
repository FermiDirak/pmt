const Git = require('nodegit');
const io = require('../utils/io');
const gitUtils = require('../utils/git');

const Story = require('./../datastructures/story');



/** creates a story in .git/stories.json
 * @param {string} id The branch name associated with the story
 * @param {string} descriptor The description of the story */
const pmtStory = (id, descriptor) => gitUtils.getBranchesList()
  .then(branches => {
    //@TODO: in the future, we should enforce this to be gitUsername/id

    if (branches.some(branch => branch === id)) {
      return gitUtils.createBranch(id);
    }
  })
  .then(() => new Story(id, descriptor))
  .then(story => writeStory(story))
  // prompting to checkout to branch should happen in index.js


module.exports = pmtStory;