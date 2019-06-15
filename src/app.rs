use clap::{App, crate_version, crate_description, crate_authors};

pub fn build() -> App<'static, 'static> {
  App::new("pmt")
    .version(crate_version!())
    .about(crate_description!())
    .author(crate_authors!())
}