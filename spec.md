     __/\\\\\\\\\\\\\____/\\\\____________/\\\\__/\\\\\\\\\\\\\\\_
      _\/\\\/////////\\\_\/\\\\\\________/\\\\\\_\///////\\\/////__
       _\/\\\_______\/\\\_\/\\\//\\\____/\\\//\\\_______\/\\\_______
        _\/\\\\\\\\\\\\\/__\/\\\\///\\\/\\\/_\/\\\_______\/\\\_______
         _\/\\\/////////____\/\\\__\///\\\/___\/\\\_______\/\\\_______
          _\/\\\_____________\/\\\____\///_____\/\\\_______\/\\\_______
           _\/\\\_____________\/\\\_____________\/\\\_______\/\\\_______
            _\/\\\_____________\/\\\_____________\/\\\_______\/\\\_______
             _\///______________\///______________\///________\///________

# Docs
 The ultimate thirst quencher and git workflow management tool

## Commands

### story <ticket_id> [descriptor]

Creates a `story` with a given `identifier` and `descriptor` and likewise creates the `story` on `origin`.

Behind the scenes, `create` creates a branch named after the unique identifier. An identifier could be a ticket id or a short unique identifier. The branch is likewise created on `origin` and sets upstream locally to the origin branch.

### sub | task | subtask <subtask_descriptor>

Creates a `subtask` with a given descriptor and an assigns a numberical incremental id to the `subtask`.

Behind the scenes, this creates an empty commit with the descriptor as the message. Commits are chained in the chronological order in which their associated tasks are created. Changes to a `subtask` change the associated commit. This effectively decouples commits and time / order, and allows us to have more meaningful commits w/ meaningful commit messages in your commit logs.

### checkout [task_descriptor_regex]

`Checkout` will list all open `stories` on your machine, as well as `master`. If a regex is provided, `checkout` will only display `stories` that match the regex. `Checkout` will then ask you to select one of the listed `stories` to check into, or automatically check you in if a regex is given and filters down to a singular `story`. Checking out will stash all unsaved changes and immediately check you into the selected `story`.

Behind the scenes, `checkout` works via Git branching. Each `story` is a Git branch, and checking out into a `story` simply checks into that `story`'s branch. Before checkout takes place, all unstaged changes are stashed, and all saved changes are pushed to origin.

A user should be able to switch between `stories` without having to worry about saving progress or losing mental flow.

### diff [task_id] [-a --all]

Lists all the changes made in a given `task`. If no `task_id` is provided, then diff lists all the tasks which can be selected to display individual `task` diffs. If a -a parameter is appended, `diff` lists all changes on the current `task`.

Behind the scenes, diff shows all the changes made on the given commit associated with the `task_id`.

### add ...files

A literal alias to `git add`.

Note by the author: Staging is a critical concept for effective context switching. Abstracting away staging would not be productive for feature workflow.

### commit [task_id] ...files [-n <task_descriptor>]

If a `task_id` is provided, then staged changes made are added to the given `task`. If a `-n` optional is provided, then a new `task` is created with the given "task_descriptor" and changes are added to the new `task`. Otherwise, a list of `tasks` are provided that the user can pick to add the staged changes to.

### mpr

Makes a pull request for the given feature.

Note by the author: this should either be configured to run a user provided script, or work directly with various Version Control vendors such as Git or BitBucket.

### log

Logs commit history on `master`. Updates master before being called.

##More to come in the near future!
