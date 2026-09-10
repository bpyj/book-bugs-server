const bcrypt = require("bcryptjs");

const pin = process.argv[2];

if (!pin) {
  console.error("Usage: node scripts/hash-pin.js <PIN>");
  process.exit(1);
}

if (!/^\d{4,6}$/.test(pin)) {
  console.error("PIN must contain 4 to 6 digits.");
  process.exit(1);
}

bcrypt.hash(pin, 12).then((hash) => {
  console.log(hash);
});
