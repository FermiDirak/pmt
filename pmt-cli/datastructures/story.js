const io = require('../utils/io');

/** A struct that contains information about a story */
class Story {
  constructor(id, descriptor = null) {
    this.id = id;
    this.descriptor = descriptor;
    this.tasks = [];
  }

  addTask(task) {
    if (this.includesTask(task)) { return; }
    this.tasks.push(task);
  }

  /** Checks if a given task is already in the story
   * @param task {Task} The task to look for
   * @return {boolean} whether the task is included or not */
  includesTask(task) {
    return this.tasks.some(memberTask => memberTask.commitHash === task.commitHash);
  }
}

/** deserializes a story in object form into a Story instance
 * @param storyObject {object} The story object to be transformed
 * @return {Story} the story instance */
Story.deserialize = storyObject => new Story(storyObject.id, storyObject.descriptor);

/** deserializes the content of the story store
 * @param {string} storiesContent The content of the stories store
 * @return {Array<Story>} A list of stories serialized in stories store */
Story.deserializeStories = (storiesContent) => {
  try {
    const stories = JSON.parse(storiesContent);
    return stories.map(story => Story.deserialize(story));
  } catch (error) {
    return [];
  }
};

/** syncs stories store with the given list of branches
 * @param {Array<string>} list of branches
 * @return {Array<stories>} A list of stories */
Story.syncStoriesWithBranches = async (branches) => {
  const stories = await Story.getStories();

  console.log(branches, stories);
};


/** retrieves the list of saved stories */
Story.getStories = async () => {
  const serializedStories = await io.readFromPMT(io.STORIES_FILENAME);
  return Story.deserializeStories(serializedStories);
};


module.exports = Story;
