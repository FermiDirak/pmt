extern crate clap;

mod pmt_note;
mod pmt_notes;

use std::env;
use std::process;
use std::process::Command;

use clap::{crate_authors, crate_description, crate_version, App, AppSettings, Arg, SubCommand};

use pmt_note::pmt_note;
use pmt_notes::pmt_notes;

fn main() {
    let matches = App::new("pmt")
        .version(crate_version!())
        .about(crate_description!())
        .author(crate_authors!())
        .setting(AppSettings::SubcommandRequiredElseHelp)
        .setting(AppSettings::AllowExternalSubcommands)
        .subcommand(
            SubCommand::with_name("note")
                .about("takes a note localized within the current git repo")
                .arg(
                    Arg::from_usage("<note> the message note you would like to record.")
                        .required(true),
                ),
        )
        .subcommand(SubCommand::with_name("notes").about("lists out notes in the repo"))
        .get_matches();

    if let Some(_matches) = matches.subcommand_matches("note") {
        pmt_note(_matches);
        process::exit(0);
    }

    if let Some(_matches) = matches.subcommand_matches("notes") {
        pmt_notes();
        process::exit(0);
    }

    if let Some(_subcommand) = matches.subcommand_name() {
        let args: Vec<String> = env::args().collect();
        let args = &args[1..];

        let _output = Command::new("git")
            .args(args)
            .output()
            .expect("failed to execute process");

        // process::exit(0);
    }
}
