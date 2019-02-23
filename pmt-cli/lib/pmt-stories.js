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

/** printes stories in a list format */
const pmtStories = async () => {
  const branchesList = await git.getBranchesList();
  const stories = await Story.syncStoriesWithBranches(branchesList);
  process.stdout.write(formatStories(stories));
};

module.exports = pmtStories;
