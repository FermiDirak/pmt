extern crate clap;

use std::env;
use std::ffi::{OsString};
use std::path::{PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use std::fs::{OpenOptions, read_to_string};
use std::io::Write;
use std::vec::{Vec};
use serde::{Serialize, Deserialize};
use serde_json;
use clap::{ArgMatches};

const NOTES_STORE_FILENAME: &str = "pmt/notes.json";

#[derive(Serialize, Deserialize, Debug)]
pub struct Note {
  note_message: String,
  time_stamp: u128,
}

pub fn pmt_note(matches: &ArgMatches<'_>) {
  let note_message = &matches.args["note"].vals[0];
  let time_stamp = SystemTime::now().duration_since(UNIX_EPOCH)
    .expect("Negative timestamp")
    .as_millis();

  let note = Note {
    note_message: OsString::from(note_message).into_string().unwrap(),
    time_stamp: time_stamp,
  };

  let git_dir = get_git_directory().unwrap();
  let notes_store_path = git_dir.join(NOTES_STORE_FILENAME);

  let mut notes = read_notes_from_store(notes_store_path);
  notes.push(note);


  let notes_store_path = git_dir.join(NOTES_STORE_FILENAME);
  write_notes_to_store(notes_store_path, notes);
}

    // let mut file = OpenOptions::new()
    //   .create_new(true)
    //   .write(true)
    //   .append(true)
    //   .open(notes_store_path)
    //   .unwrap();

fn read_notes_from_store(notes_store_path: PathBuf) -> Vec<Note> {
  if !notes_store_path.exists() {
    return Vec::new();
  }

  let deserialized_notes = read_to_string(notes_store_path)
    .expect("Something went wrong reading from notes store");

  return serde_json::from_str(&deserialized_notes).unwrap();
}

fn write_notes_to_store(notes_store_path: PathBuf, notes: Vec<Note>) {
  let mut file = OpenOptions::new()
    .create(true)
    .write(true)
    .open(notes_store_path)
    .unwrap();

  let serialized_notes = serde_json::to_string(&notes).unwrap();

  file.write_all(serialized_notes.as_bytes());
}

// fn save_struct_to_file(path: PathBuf, content: String) -> bool {
//   return true;
// }

/** gets the git directory */
fn get_git_directory() -> Result<PathBuf, String> {
  let mut current_dir = env::current_dir().unwrap();

  while !current_dir.parent().is_none() {
    let git_directory = current_dir.join(".git");

    if git_directory.exists() {
      return Ok(git_directory);
    }

    current_dir.pop();
  }

  return Err(String::from("not a git repository"));
}
