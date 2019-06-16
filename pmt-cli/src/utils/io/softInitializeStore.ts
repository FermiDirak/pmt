import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import getGitDirectory from './../git/getGitDirectory';
import { PMT_DIRECTORY } from './constants';

const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const access = promisify(fs.access);

/** Creates an empty pmt store if one doesn't already exist
 * @param storeName The file to create if DNE
 * @return the filepath to the pmt file */
async function softInitializeStore(storeName: string): Promise<string> {
  const gitDirectory = await getGitDirectory();
  const folderDirectory = path.join(gitDirectory, PMT_DIRECTORY);
  const filePath = path.join(folderDirectory, storeName);

  // if pmt directory doesn't exist, create it
  try {
    await access(folderDirectory);
  } catch (error) {
    await mkdir(folderDirectory);
  }

  // if file doesn't exist, create it
  try {
    await access(filePath);
  } catch (error) {
    await writeFile(filePath, '');
  }

  return filePath;
};

export default softInitializeStore;
