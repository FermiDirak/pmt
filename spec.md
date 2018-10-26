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

### create feature [ticket_id] [descriptor]

Creates a `feature` with a given `identifier` and `descriptor` and likewise creates it on `origin`.

Behind the scenes, `create` creates a branch named after the unique identifier. It then pushes the branch to origin and sets upstream to the newly pushed branch.

### checkout [branch_descriptor_regex _(optional)_]

`Checkout` will list all open `features` on your machine, as well as the `master` branch [1]. `Checkout` will then ask you to select one of the `features` to check into. Checking out will stash all unsaved changes and immediately check you into the given `feature`.

[1] If a regex is provided, it will only display branches that match the regex. If a regex perfectly matches, then the matching `feature` will automatically be checked into.

Behind the scenes, `checkout` works via Git branching. Each feature is a Git branch, and checking out into a `feature` simply checks into that `feature`'s branch. Before checkout takes place, all unstaged changes are stashed, and all saved changes are pushed to origin.

A user should be able to switch between features without having to worry about saving progress or losing mental flow.

### create task "task_descriptor"

Creates a task with a given descriptor and an assigns a numberical incremental id to the task.

Behind the scenes, this creates an empty commit with the descriptor as the message. Commits are chained in the chronological order in which their associated tasks are created. Changes to a task change the associated commit. This effectively decouples commits and time / order, and allows us to have more meaningful commits w/ meaningful commit messages.

### ls

Lists the tasks for the currently checked in `feature`. Self explanitory. Lul!

### diff [task_id]

Lists all the changes made in a given `task`. If no `task_id` is provided, then diff lists all unstaged changes. If a -a parameter is appended, diff lists all changes on the current `feature`.

Behind the scenes, diff shows all the changes made on the given commit associated with the `task_id`.

### add ...files

A literal alias to `git add`. Nothing special here.

### commit [task_id (optional)] ...files

If a `task_id` is provided, then staged changes made are committed to the given task. Otherwise, a list of tasks is provided that the user can pick to commit the staged changes to.

### switch [feature_name_regex]

lists all `features` that the user can pick to switch to. If a regex is provided, the list is filtered by the regex and if a match exists, then pmt switchs to the given `feature` directly.

All staged changes are stashed before switching to the other feature. Switching to a feature with stashed changes will automatically unstash all changes.

### mpr

Makes a pull request for the given feature.

##More to come in the near future!

___

## Additional Notes

Interestingly, once a feature is merged to master, every commit appended to master is effectively final and should not be mutated in any way.