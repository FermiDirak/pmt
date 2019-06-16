import fs from 'fs';
import chalk from 'chalk';
import {readNotes} from '../datastructures/note';

async function pmtNotes() {
  const notes = await readNotes();

  process.stdout.write(chalk.bold("notes:\n"));

  notes.forEach(note => {
    process.stdout.write("  " + JSON.stringify(note));
  });
}

export default pmtNotes;
