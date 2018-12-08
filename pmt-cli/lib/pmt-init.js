const io = require('../utils/io');
const User = require('../datastructures/user');

/** creates a user and stores it in .git/user.json
 * If the user already exists, the user will be updated
 * @param {User} user The user to write to storage
 * @return {Promise<void>} */
const createUser = async user => io.writeToPMT(
  io.USER_FILENAME,
  User.serialize(user),
);

const pmtInit = async (nick) => {
  const user = new User(nick);
  await createUser(user);

  process.stdout.write(`nick set to: ${nick}\n`);
};

module.exports = pmtInit;
