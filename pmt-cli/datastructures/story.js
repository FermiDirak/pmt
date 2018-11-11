/**
 * The Story struct contains information about a story
 */
class Story {
  constructor(id, descriptor = null) {
    this.id = id;
    this.descriptor = descriptor;

    this.tasks = [];
  }

  addTask(task) {
    if(this.includesTask(task)) {
      return;
    }

    this.tasks.push(task);
  }

  /** Checks if a given task is already in the story
   * @param task {Task} The task to look for
   * @return {boolean} whether the task is included or not */
  includesTask(task) {
    //@TODO

    return true;
  }
}