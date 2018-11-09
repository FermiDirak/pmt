#!/usr/bin/env node

const program = require('commander');
const Git = require('nodegit');
const prettyDebug = require('./lib/pretty-debug');

const pmtLog = require('./lib/pmt-log');
const pmtAdd = require('./lib/pmt-add');

const currentDirectory = process.cwd();

program
  .version('1.0.0')
  .description('The ultimate thirst quencher and git workflow tool');

program
  .command('story <ticket_id>')
  .description('creates a story with the given id')
  .option('-d --description <description>', 'specifies a description for the feature')
  .action((ticket_id, options) => {
    const {description} = options;

    prettyDebug.printCommand("story", ticket_id, ['-d', description]);

    process.exit(0);
  });

program
  .command('sub <subtask_descriptor>')
  .alias('task')
  .alias('subtask')
  .description('creates a subtask with a given descriptor')
  .action(subtask_descriptor => {
    prettyDebug.printCommand("sub", subtask_descriptor);

    process.exit(0);
  });

program
  .command('checkout <task_descriptor_regex>')
  .description('checks out specified story')
  .action(task_descriptor_regex => {
    prettyDebug.printCommand("checkout", task_descriptor_regex);

    process.exit(0);
  });

  program
  .command('diff [task_id]')
  .description('lists all changes made in a given task')
  .option('-a --all', 'specifies whether to show diff across all tasks')
  .action((task_id, options) => {
    const {all} = options;

    prettyDebug.printCommand("diff", task_id, ['-a', all]);

    process.exit(0);
  });

program
  .command('add')
  .description('an alias to `git add`')
  .option('-a -A --all', 'specifies to add all unstaged files')
  .action(() => {
    const args = program.rawArgs.slice(3);

    prettyDebug.printCommand("add", args);

    pmtAdd(args);

    process.exit(0);
  });

program
  .command('commit [task_id] [file ...]')
  .description('adds staged changes to commit "task_id"')
  .option('-n --new <task_descriptor>', "creates a new task to add stage changes to")
  .action((env, file, options) => {
    const {new: task_descriptor} = options;

    prettyDebug.printCommand("commit", `${env} ${file}`, ['-n', task_descriptor]);

    process.exit(0);
  });

// MPR

program
  .command('log')
  .description('logs your commit history')
  .action(() => {
    prettyDebug.printCommand("log");

    pmtLog(currentDirectory)
      .then(() => {
        process.exit(0);
      })
      .catch(() => {
        prettyDebug.printError(error);
        process.exit(1);
      });
  });

program.parse(process.argv);