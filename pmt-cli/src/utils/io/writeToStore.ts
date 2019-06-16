import fs from 'fs';
import { promisify } from 'util';

const writeFile = promisify(fs.writeFile);

import softInitializeStore from './softInitializeStore';

/** Writes content to the store in the pmt directory
 * @param storeName The name of the store to write content to
 * @param content The content to write to the store */
async function writeToStore(storeName: string, content: string) {
  const filePath = await softInitializeStore(storeName);
  return writeFile(filePath, content);
};

export default writeToStore;
