const Git = require('nodegit');
const io = require('../utils/io');

const User = require('../datastructures/user');

const pmtInit = (nick) => {
  const user = new User(nick);

  return io.createUser(user);
}

module.exports = pmtInit;