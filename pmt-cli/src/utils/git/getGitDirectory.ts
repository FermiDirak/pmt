import fs from 'fs';
import path from 'path';

/** Returns the path of the .git/ directory
 * @return the .git directory path */
function getGitDirectory(): string {
  const currentDirectory = process.cwd();
  const splitPath = [path.sep, ...currentDirectory.split(path.sep)];

  // recursively traverse up folder structure to find .git directory
  while (splitPath.length >= 1) {
    const gitDir = path.join(...splitPath, '.git');
    if (fs.existsSync(gitDir)) {
      return gitDir;
    }

    splitPath.pop();
  }

  throw new Error('not a git repository (no .git)');
};

export default getGitDirectory;