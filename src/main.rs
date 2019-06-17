extern crate clap;

use std::process;
use std::env;
use std::process::Command;

use clap::{
    App,
    SubCommand,
    AppSettings,
    crate_version,
    crate_description,
    crate_authors
};

fn main() {
    let matches = App::new("pmt")
        .version(crate_version!())
        .about(crate_description!())
        .author(crate_authors!())
        .setting(AppSettings::SubcommandRequiredElseHelp)
        .setting(AppSettings::AllowExternalSubcommands)
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

    if let Some(_subcommand) = matches.subcommand_name() {
        let args: Vec<String> = env::args().collect();
        let args = &args[1..];

        println!("running: `{:?}`", args);

        let _output = Command::new("git")
            .args(args)
            .spawn()
            .expect("failed to execute process");

        process::exit(0);
    }
}
