import fs from 'fs';
import { promisify } from 'util';

const readFile = promisify(fs.readFile);

import softInitializeStore from './softInitializeStore';

/** Writes content to the store in the pmt directory
 * @param storeName The name of the store to write content to
 * @return the content of the store */
async function writeStore(storeName: string): Promise<string> {
  const filePath = await softInitializeStore(storeName);
  return readFile(filePath, 'utf8');
};

export default writeStore;
