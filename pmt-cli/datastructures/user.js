const io = require('../utils/io');

/**
 * The struct used for storing user related information
 */
class User {
  constructor(nick) {
    this.nick = nick;
  }
}

/** Serializes the user for storage
 * @param {User} user The user instance to serialize
 * @return {string} The serialized user object */
User.serialize = user => JSON.stringify(user);

User.deserialize = serializedUser => new User(JSON.parse(serializedUser).nick);

/** Reads user config information from .git
 * @return {User} The user config information */
User.readUser = async () => {
  const serializedUser = await io.readFromPMT(io.USER_FILENAME);
  return User.deserialize(serializedUser);
};

module.exports = User;
