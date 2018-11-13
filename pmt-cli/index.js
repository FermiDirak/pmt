#!/usr/bin/env node

const program = require('commander');
const prettyPrint = require('./utils/prettyPrint');

const pmtStory = require('./lib/pmt-story');
const pmtLog = require('./lib/pmt-log');
const pmtAdd = require('./lib/pmt-add');
const pmtStories = require('./lib/pmt-stories');

program
  .version('1.0.0')
  .description('The ultimate thirst quencher and git workflow tool');

program
  .command('story <ticket_id> [description]')
  .description('creates a story with the given id and description')
  .action((ticketId, description) => {
    prettyPrint.command('story', ticketId, ['-d', description]);

    pmtStory(ticketId, description);

    process.exit(0);
  });

program
  .command('stories')
  .description('lists out open stories')
  .action(() => {
    prettyPrint.command('stories', null);

    pmtStories()
      .then(() => {
        process.exit(0);
      })
      .catch((error) => {
        prettyPrint.error(error);

        process.exit(1);
      });
  });

program
  .command('sub <subtask_descriptor>')
  .alias('task')
  .alias('subtask')
  .description('creates a subtask with a given descriptor')
  .action((subtaskDescriptor) => {
    prettyPrint.command('sub', subtaskDescriptor);

    process.exit(0);
  });

program
  .command('checkout <task_descriptor_regex>')
  .description('checks out specified story')
  .action((taskDescriptorRegex) => {
    prettyPrint.command('checkout', taskDescriptorRegex);

    process.exit(0);
  });

program
  .command('diff [task_id]')
  .description('lists all changes made in a given task')
  .option('-a --all', 'specifies whether to show diff across all tasks')
  .action((taskId, options) => {
    const { all } = options;

    prettyPrint.command('diff', taskId, ['-a', all]);

    process.exit(0);
  });

program
  .command('add')
  .description('an alias to `git add`')
  .option('-a -A --all', 'specifies to add all unstaged files')
  .action(() => {
    const args = program.rawArgs.slice(3);

    prettyPrint.command('add', args);

    pmtAdd(args);

    process.exit(0);
  });

program
  .command('commit [task_id] [file ...]')
  .description('adds staged changes to commit "task_id"')
  .option('-n --new <task_descriptor>', 'creates a new task to add stage changes to')
  .action((env, file, options) => {
    const { new: taskDescriptor } = options;

    prettyPrint.command('commit', `${env} ${file}`, ['-n', taskDescriptor]);

    process.exit(0);
  });

// MPR

program
  .command('log')
  .description('logs your commit history')
  .action(() => {
    prettyPrint.command('log');

    pmtLog()
      .catch((error) => {
        prettyPrint.error(error);
        process.exit(1);
      });
  });

program.parse(process.argv);
