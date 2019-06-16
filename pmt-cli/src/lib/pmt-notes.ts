import fs from 'fs';
import chalk from 'chalk';
import {readNotes} from '../datastructures/note';

async function pmtNotes() {
  const rawNotes = await readNotes()

  const notes = rawNotes.reverse().map(note => ({
    timeStamp: new Date(note.timeStamp).toLocaleString("en-US"),
    content: note.content,
  }));

  process.stdout.write(chalk.bold('notes:\n'));

  notes.forEach(note => {
    process.stdout.write('  ' + JSON.stringify(note) + '\n');
  });
}

export default pmtNotes;
