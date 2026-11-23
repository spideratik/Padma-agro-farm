// Usage:  npm run reset-password            -> generates a new random password
//         npm run reset-password -- MyNewPass123
// Run it in the project folder (the one that contains the "data" folder). Stop the server first, then start it again.
import crypto from 'node:crypto';
import * as store from '../server/store.js';

const db = store.load();
const given = process.argv[2];
if (given && given.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}
const password = given || crypto.randomBytes(6).toString('base64url');
const salt = crypto.randomBytes(16).toString('hex');
db.secrets.salt = salt;
db.secrets.passwordHash = store.hashPassword(password, salt);
db.secrets.tokenSecret = crypto.randomBytes(32).toString('hex'); // signs out any open sessions
store.save();

console.log('\nAdmin password has been reset.');
console.log(`\n  New password:  ${password}\n`);
console.log('Start (or restart) the app and sign in with it. You can change it later in Settings.\n');
