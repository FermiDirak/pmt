import readStore from '../utils/io/readStore';
import writeToStore from '../utils/io/writeToStore';

const STORE_NAME = 'notes';

type Note = {
  timeStamp: number,
  content: string,
}

function createNote(content: string): Note {
  const timeStamp = Date.now();

  return {
    timeStamp,
    content,
  }
}

async function writeNote(note: Note): Promise<Array<Note>> {
  const notes = await readNotes();
  notes.push(note);
  await writeToStore(STORE_NAME, JSON.stringify(notes));

  return notes;
}

async function readNotes(): Promise<Array<Note>> {
  const storeContent = await readStore(STORE_NAME);
  let rawNotes = [];

  try {
    rawNotes = JSON.parse(storeContent);
  } catch {
    rawNotes = [];
  }

  return rawNotes;
}

export {createNote, writeNote, readNotes, Note};