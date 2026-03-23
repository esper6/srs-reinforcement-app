import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";

function getSecret(): Buffer {
  const hex = process.env.API_KEY_SECRET;
  if (!hex) throw new Error("API_KEY_SECRET env var is not set");
  return Buffer.from(hex, "hex");
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getSecret(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv:tag:ciphertext (all hex)
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(stored: string): string {
  const [ivHex, tagHex, cipherHex] = stored.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const encrypted = Buffer.from(cipherHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, getSecret(), iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final("utf8");
}
