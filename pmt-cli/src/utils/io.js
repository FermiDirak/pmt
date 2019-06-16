const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const { promisify } = require('util');

const git = require('./git');

const mkdtemp = promisify(fs.mkdtemp);
const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const mkdir = promisify(fs.mkdir);
const access = promisify(fs.access);

const PMT_DIRECTORY = 'pmt';
const STORIES_FILENAME = 'stories.json';
const USER_FILENAME = 'user.json';

/** Creates an empty pmt file if one doesn't already exist
 * @param {string} fileName The file to create if DNE
 * @return {string} the filepath to the pmt file */
const softInitializePMTFile = async (fileName) => {
  const gitDirectory = await git.getGitDirectory();
  const folderDirectory = path.join(gitDirectory, PMT_DIRECTORY);
  const filePath = path.join(folderDirectory, fileName);

  try {
    await access(folderDirectory);
  } catch (error) {
    await mkdir(folderDirectory);
  }

  try {
    await access(filePath);
  } catch (error) {
    await writeFile(filePath, '');
  }

  return filePath;
};

/** Writes content to the fileName in the pmt directory
 * @param {string} fileName The name of the file to write content to
 * @param {string} content The content to write to file */
const writeToPMT = async (fileName, content) => {
  const filePath = await softInitializePMTFile(fileName);
  return writeFile(filePath, content);
};

/** Reads content form pmt file
 * @param {string} fileName The file to read content from
 * @return {string} the content of the file */
const readFromPMT = async (fileName) => {
  const filePath = await softInitializePMTFile(fileName);
  return readFile(filePath, 'utf8');
};

/** Creates a temporary file in /tmp and returns the temporary file location
 * @param dirName {string} the directory name
 * @param fileName {string} the fileName of the file location
 * @return {string} file path to temporary file */
const makeTempFile = async (dirName, fileName) => {
  const directory = path.join(os.tmpdir(), `${dirName}-`);
  const tempPath = await mkdtemp(directory);
  const tempFilePath = path.join(tempPath, fileName);

  if (!tempFilePath) {
    throw new Error('temp file not created');
  }

  await writeFile(tempFilePath, '');

  return tempFilePath;
};

/** opens a file with user's prefered file reader (defaults to less)
 * @param filePath The path of the file to open with reader */
const openFileInReader = filePath => new Promise((resolve, reject) => {
  const child = spawn('less', [filePath], {
    stdio: 'inherit',
    detached: true,
  });

  child.on('close', () => {
    resolve();
  });

  child.on('error', (error) => {
    reject(error);
  });
});


module.exports = {
  STORIES_FILENAME,
  USER_FILENAME,
  readFromPMT,
  writeToPMT,
  makeTempFile,
  openFileInReader,
};
