#[path = "notes_store.rs"]
mod notes_store;

pub fn pmt_notes() {
  let notes = notes_store::read_notes_from_store();

  println!("{:?}", notes);
}