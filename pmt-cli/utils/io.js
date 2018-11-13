const process = require('process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { promisify } = require('util');

const Story = require('../datastructures/story');

const pager = require('default-pager');

const mkdtemp = promisify(fs.mkdtemp);
const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);


const STORIES_FILENAME = 'stories.json';


/** Returns a promise that returns the path of the .git/ directory
 * @return {Promise<string>} The .git directory path */
const getGitDirectory = () => new Promise((resolve, reject) => {
  const currentDirectory = process.cwd();
  const splitPath = [path.sep, ...currentDirectory.split(path.sep)];

  while (splitPath.length >= 1) {
    const gitDir = path.join(...splitPath, '.git');

    if (fs.existsSync(gitDir)) {
      resolve(gitDir);
    }

    splitPath.pop();
  }

  reject(new Error('not a git repository (or any of the parent directories): .git'));
});


/** Creates a temporary file in /tmp and returns the temporary file location
 * @param dirName {string} the directory name
 * @param fileName {string} the fileName of the file location
 * @return {string} file path to temporary file */
const makeTempFile = (dirName, fileName) => {
  const directory = path.join(os.tmpdir(), `${dirName}-`);
  let tempFilePath = null;

  return mkdtemp(directory)
    .then((tempPath) => {
      tempFilePath = path.join(tempPath, fileName);

      // make sure the content of tempFile is empty
      return writeFile(tempFilePath, '');
    })
    .then(() => {
      if (!tempFilePath) {
        throw new Error('temp file not created');
      }

      return tempFilePath;
    });
};


/** creates a write stream to a file
 * @param filePath {string} The path of the file to open a write stream to
 * @return WriteStream a stream to add content to
 */
const createWriteStream = (filePath) => {
  const options = { flags: 'a' };

  return fs.createWriteStream(filePath, options);
};


/** opens a file with user's prefered file reader (defaults to less)
 * @param filePath The path of the file to open with reader */
const openFileInReader = (filePath) => {
  fs.createReadStream(filePath).pipe(pager());
};


/** reads content from .git/stories.json
 * @return {Promise<Array<stories>>} A promise that returns the list of stories saved in memory */
const readStories = () => getGitDirectory()
  .then((gitDirectory) => path.join(gitDirectory, STORIES_FILENAME))
  .then((storiesPath) => readFile(storiesPath))
  .then((storiesContent) => {
    if (!storiesContent) {
      return [];
    }

    let stories = JSON.stringify(storiesContent);

    stories.map(story => Story.deserialize(story));

    return stories;
  });

/** adds a story to .git/stories.json
 * @return {Promise<Array<stories>>} The new list of the stories in .git/stories.json */
const writeStory = (story) => {
  let stories = [];
  let storiesPath = null;

  return readStories()
    .then((_stories) => {
      stories = _stories;
    })
    .then(() => getGitDirectory())
    .then((gitDirectory) => path.join(gitDirectory, STORIES_FILENAME))
    .then(storiesPath => {
      stories.push(story);

      fs.writeFile(storiesPath, JSON.stringify(stories));

      return stories;
    });
}


module.exports = {
  getGitDirectory,
  makeTempFile,
  createWriteStream,
  openFileInReader,
};
