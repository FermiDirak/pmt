use std::path::{PathBuf};
use std::fs::{OpenOptions, read_to_string};
use std::io::Write;
use std::vec::{Vec};
use serde::{Serialize, Deserialize};
use serde_json;

#[derive(Serialize, Deserialize, Debug)]
pub struct Note {
  pub note_message: String,
  pub time_stamp: u128,
}

pub fn read_notes_from_store(notes_store_path: PathBuf) -> Vec<Note> {
  if !notes_store_path.exists() {
    return Vec::new();
  }

  let deserialized_notes = read_to_string(notes_store_path)
    .expect("Something went wrong reading from notes store");

  return serde_json::from_str(&deserialized_notes).unwrap();
}

pub fn write_notes_to_store(notes_store_path: PathBuf, notes: Vec<Note>) {
  let mut file = OpenOptions::new()
    .create(true)
    .write(true)
    .open(notes_store_path)
    .unwrap();

  let serialized_notes = serde_json::to_string(&notes).unwrap();

  file.write_all(serialized_notes.as_bytes()).unwrap();
}
