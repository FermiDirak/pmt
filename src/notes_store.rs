#[path = "git.rs"]
mod git;

use git::get_git_directory;
use serde::{Deserialize, Serialize};
use serde_json;
use std::fs::{read_to_string, OpenOptions};
use std::io::Write;
use std::vec::Vec;

#[derive(Serialize, Deserialize, Debug)]
pub struct Note {
    pub note_message: String,
    pub time_stamp: u128,
}

const NOTES_STORE_FILENAME: &str = "pmt/notes.json";

pub fn read_notes_from_store() -> Vec<Note> {
    let git_dir = get_git_directory().unwrap();
    let notes_store_path = git_dir.join(NOTES_STORE_FILENAME);

    if !notes_store_path.exists() {
        return Vec::new();
    }

    let deserialized_notes =
        read_to_string(notes_store_path).expect("Something went wrong reading from notes store");

    return serde_json::from_str(&deserialized_notes).unwrap();
}

pub fn write_notes_to_store(notes: Vec<Note>) {
    let git_dir = get_git_directory().unwrap();
    let notes_store_path = git_dir.join(NOTES_STORE_FILENAME);

    let mut file = OpenOptions::new()
        .create(true)
        .write(true)
        .open(notes_store_path)
        .unwrap();

    let serialized_notes = serde_json::to_string(&notes).unwrap();

    file.write_all(serialized_notes.as_bytes()).unwrap();
}
