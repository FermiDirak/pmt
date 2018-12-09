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
 */
User.serialize = user => JSON.stringify(user);

User.deserialize = serializedUser => User(JSON.parse(serializedUser).nick);

module.exports = User;
