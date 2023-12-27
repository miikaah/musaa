import { randomBytes } from "crypto";
import { hashPassword } from "../src/cryptography";

const [, , username, password] = process.argv;

function generateSalt(length: number): string {
  return randomBytes(length).toString("hex");
}

const main = async () => {
  const salt = generateSalt(32); // 32 bytes, 64 characters in hex
  const hashedPassword = hashPassword(salt, password);

  console.log({
    [username]: {
      password: hashedPassword,
      salt,
    },
  });
};

main();
