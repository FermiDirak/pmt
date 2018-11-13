/** A struct that contains information about a story */
class Story {
  constructor(id, descriptor = null) {
    this.id = id;
    this.descriptor = descriptor;

    this.tasks = [];
  }

  addTask(task) {
    if (this.includesTask(task)) {
      return;
    }

    this.tasks.push(task);
  }

  /** Checks if a given task is already in the story
   * @param task {Task} The task to look for
   * @return {boolean} whether the task is included or not */
  includesTask(task) {
    return this.tasks.some(memberTask => {
      return memberTask.commitHash === task.commitHash;
    }
  }
}

/** deserializes a story in object form into a Story instance
 * @param storyObject {object} The story object to be transformed
 * @return {Story} the story instance */
Story.deserialize = (storyObject) => {
  return new Story(storyObject.id, storyObject.descriptor);
}


module.exports = Story;
