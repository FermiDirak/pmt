import fs from 'fs';
import chalk from 'chalk';
import {createNote, writeNote} from '../datastructures/note'

async function pmtNote(noteContent: string) {
  const note = createNote(noteContent);
  const notes = await writeNote(note);

  process.stdout.write(
    chalk.bold("note added: ") + JSON.stringify(note) + "\n"
  );
}

export default pmtNote;
