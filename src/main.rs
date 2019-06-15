extern crate clap;

mod app;

// struct Cli {
//     pattern: String,
//     path: std::path::PathBuf,
// }

fn main() {
    let matches = app::build()
        .get_matches();

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
