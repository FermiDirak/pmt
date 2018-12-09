const chalk = require('chalk');
const git = require('../utils/git');
const Story = require('../datastructures/story');

/** formats a list of stories for std output
 * @param stories {Array<Story>} A list of stories
 * @return {string} The formatted string to output */
const formatStories = (stories) => {
  let formattedStories = '';

  stories.forEach((story) => {
    let formattedStory = '  * ';

    if (story.id === 'master') {
      formattedStory += `${chalk.bold(story.id)}`;
    } else {
      formattedStory += `${story.id} ${chalk.italic(story.descriptor || 'no description')}`;
    }

    formattedStories += `${formattedStory}\n`;
  });

  return formattedStories;
};

/** Gets the list of stories from a list of branches
 * @param branches {Array<string>} The list of branches used to update stories
 * @return {Array<Story>} The list of stories */
const storiesFromBranches = async branches => Story.syncStoriesWithBranches(branches);

/** printes stories in a list format */
const pmtStories = async () => {
  const branchesList = await git.getBranchesList();
  const stories = await storiesFromBranches(branchesList);
  process.stdout.write(formatStories(stories));
};

module.exports = pmtStories;
