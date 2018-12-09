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


/** deserializes a story in object form into
 * a Story instance
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


/** serializes a list of stories
 * @param {Array<Story>} stories The list of stories to serialize
 * @return {string} the serialized stories */
Story.serializeStories = stories => JSON.stringify(stories);


/** retrieves the list of saved stories */
Story.readStories = async () => {
  const serializedStories = await io.readFromPMT(io.STORIES_FILENAME);
  return Story.deserializeStories(serializedStories);
};


/** writes stories to the stories store
 * @param {Array<Story>} stories The list of stories to store */
Story.writeStories = async (stories) => {
  const serializedStories = Story.serializeStories(stories);

  await io.writeToPMT(io.STORIES_FILENAME, serializedStories);
  return stories;
};

/** writes a singular story to the story store. If story already exist,
 * then it is overwritten
 * @param {Story} storyAddition The story to add to the story store
 * @return {Array<Story>} The resulting story store */
Story.writeStory = async (storyAddition) => {
  let stories = await Story.readStories();
  let mutated = false;


  stories = stories.map((story) => {
    if (story.id === storyAddition.id) {
      mutated = true;
      return storyAddition;
    }
    return story;
  });

  if (!mutated) {
    stories.push(storyAddition);
  }

  await Story.writeStories(stories);

  return stories;
};


/** syncs stories store with the given list of branches
 * @param {Array<string>} list of branches
 * @return {Array<stories>} A list of stories */
Story.syncStoriesWithBranches = async (branches) => {
  const stories = await Story.readStories();

  const storiesMap = stories.reduce((acc, story) => {
    acc[story.id] = story;
    return acc;
  }, {});

  branches.forEach((branch) => {
    if (!storiesMap[branch]) {
      storiesMap[branch] = new Story(branch, '');
    }
  });


  return Object.values(storiesMap);
};

module.exports = Story;
