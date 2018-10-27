#!/usr/bin/env node

const program = require('commander');
const prettyDebug = require('./lib/pretty-debug');

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
  .action((subtask_descriptor) => {
    prettyDebug.printCommand("sub", subtask_descriptor);

    process.exit(0);
  });

program.parse(process.argv);