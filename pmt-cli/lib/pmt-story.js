const Git = require('nodegit');
const io = require('../utils/io');

/** creates a story in .git/stories.json
 * @param {string} id The branch name associated with the story
 * @param {string} descriptor The description of the story */
const pmtStory = (id, descriptor) => {
  // Get a list of branches

  // if branch gitUsername/id doesn't exist:
  //   create a branch gitUsername/id

  // create story {id, descriptor}

  // if story already exists:
  //   update the story with the new content
  // else: write story to .git/stories.json


  // prompting to checkout to branch should happen in index.js
}

module.exports = pmtStory;