#!/usr/bin/env node

const program = require('commander');

program
  .version('1.0.0')
  .description('The ultimate thirst quencher and git workflow tool');

program
  .command('create-feature <id>', 'creates a feature with the given id')
  .alias('feat')
  .option('-d --description', 'specifies a description for the feature')
  .action((env, option) => {
    console.log(env, option);
  });

program.parse(process.argv);