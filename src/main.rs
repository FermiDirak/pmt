extern crate clap;

use std::process;
use clap::{App, SubCommand, crate_version, crate_description, crate_authors};

// struct Cli {
//     pattern: String,
//     path: std::path::PathBuf,
// }

fn main() {
    let matches = App::new("pmt")
        .version(crate_version!())
        .about(crate_description!())
        .author(crate_authors!())
        .subcommand(SubCommand::with_name("note")
            .about("takes a note localized within the current git repo"))
        .subcommand(SubCommand::with_name("notes")
            .about("lists out notes in the repo"))
        .get_matches();

    if let Some(_matches) = matches.subcommand_matches("note") {
        println!("ran pmt note");
        process::exit(0);
    }

    if let Some(_matches) = matches.subcommand_matches("notes") {
        println!("ran pmt notes");
        process::exit(0);
    }

    println!("test: {:?}", matches);

    println!("test")

    // let pattern = std::env::args().nth(1).expect("no pattern given");
    // let path = std::env::args().nth(2).expect("no path given");

    // let args = Cli {
    //     pattern: pattern,
    //     path: std::path::PathBuf::from(path),
    // };

    // println!("Hello, world! {} {:#?}", args.pattern, args.path);
}
