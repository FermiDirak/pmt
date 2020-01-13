use std::env;
use std::path::PathBuf;

/** gets the git directory */
pub fn get_git_directory() -> Result<PathBuf, String> {
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
