extern crate clap;

#[path = "notes_store.rs"]
mod notes_store;
#[path = "git.rs"]
mod git;

use std::ffi::{OsString};
use std::time::{SystemTime, UNIX_EPOCH};
use clap::{ArgMatches};



const NOTES_STORE_FILENAME: &str = "pmt/notes.json";

pub fn pmt_note(matches: &ArgMatches<'_>) {
  let note_message = &matches.args["note"].vals[0];
  let time_stamp = SystemTime::now().duration_since(UNIX_EPOCH)
    .expect("Negative timestamp")
    .as_millis();

  let note = notes_store::Note {
    note_message: OsString::from(note_message).into_string().unwrap(),
    time_stamp: time_stamp,
  };

  let git_dir = git::get_git_directory().unwrap();
  let notes_store_path = git_dir.join(NOTES_STORE_FILENAME);

  let mut notes = notes_store::read_notes_from_store(notes_store_path);
  notes.push(note);

  let notes_store_path = git_dir.join(NOTES_STORE_FILENAME);
  notes_store::write_notes_to_store(notes_store_path, notes);
}
