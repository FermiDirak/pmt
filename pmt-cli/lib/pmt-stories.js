const Git = require('nodegit');
const chalk = require('chalk');
const io = require('../utils/io');
const gitUtils = require('../utils/git');

/** formats a list of stories for std output
 * @param stories {Array<Story>} A list of stories
 * @return string The formatted string to output */
const formatStories = (stories) => {
  let message = '';

  stories.forEach((story) => {
    let storyMessage = '  * ';

    if (story.id === 'master') {
      storyMessage += `${chalk.bold(story.id)}`;
    } else {
      storyMessage += `${story.id} ${chalk.italic('no description')}`;
    }

    message += `${storyMessage}\n`;
  });

  process.stdout.write(message);
};


/** printes stories in a list format */
const pmtStories = () => gitUtils
  .getBranchesList()
  .then((stories) => {
    formatStories(stories);
  });

module.exports = pmtStories;
