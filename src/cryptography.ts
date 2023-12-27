import crypto from "crypto";

const { CIPHER_KEY: key = "" } = process.env;

export function encrypt(text: string): string {
  const cipher = crypto.createCipheriv("aes-256-cbc", key, Buffer.alloc(16));
  let encrypted = cipher.update(text, "utf-8", "base64");
  encrypted += cipher.final("base64");

  return encrypted;
}

export function decrypt(encrypted: string): string {
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    key,
    Buffer.alloc(16),
  );
  let decrypted = decipher.update(encrypted, "base64", "utf-8");
  decrypted += decipher.final("utf-8");

  return decrypted;
}

export const hashPassword = (salt: string, password: string): string => {
  return crypto.createHash("sha256").update(`${salt}${password}`).digest("hex");
};
