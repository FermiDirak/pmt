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

function writeNote(content: string) {
  // implement write logic
}

export {writeNote, Note};