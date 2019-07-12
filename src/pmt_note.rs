extern crate clap;

#[path = "notes_store.rs"]
mod notes_store;
#[path = "git.rs"]
mod git;

use std::ffi::{OsString};
use std::time::{SystemTime, UNIX_EPOCH};
use clap::{ArgMatches};

pub fn pmt_note(matches: &ArgMatches<'_>) {
  let note_message = &matches.args["note"].vals[0];
  let time_stamp = SystemTime::now().duration_since(UNIX_EPOCH)
    .expect("Negative timestamp")
    .as_millis();

  let note = notes_store::Note {
    note_message: OsString::from(note_message).into_string().unwrap(),
    time_stamp: time_stamp,
  };

  let mut notes = notes_store::read_notes_from_store();
  notes.push(note);

  notes_store::write_notes_to_store(notes);
}
