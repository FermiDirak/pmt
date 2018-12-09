const git = require('../utils/git');
const Story = require('./../datastructures/story');

/** creates a story and adds it to the story store
 * @param {string} id The branch name associated with the story
 * @param {string} descriptor The description of the story */
const pmtStory = async (id, descriptor) => {
  const story = new Story(id, descriptor);
  await git.createBranch(id);
  await Story.writeStory(story);
};

module.exports = pmtStory;
