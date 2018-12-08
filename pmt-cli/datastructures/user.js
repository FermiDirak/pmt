/**
 * The struct used for storing user related information
 */
class User {
  constructor(nick) {
    this.nick = nick;
  }
}

User.serialize = (user) => {
  return JSON.stringify(user);
}

User.deserialize = (serializedUser) => {
  return User(JSON.parse(serializedUser).nick);
}

module.exports = User;