const {exec} = require('child_process');

const pmtAdd = (args) => {
  exec(`git add ${args.join(' ')}`);

  return;
}

module.exports = pmtAdd;