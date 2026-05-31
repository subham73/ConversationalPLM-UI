import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";

function integrationSecret() {
  const secret =
    process.env.INTEGRATION_CREDENTIAL_SECRET ??
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    process.env.POSTGRES_URL;

  if (!secret) {
    throw new Error(
      "Set INTEGRATION_CREDENTIAL_SECRET to encrypt integrations."
    );
  }

  return createHash("sha256").update(secret).digest();
}

export function encryptIntegrationCredentials(payload: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, integrationSecret(), iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptIntegrationCredentials<T>(encryptedPayload: string): T {
  const [version, iv, tag, encrypted] = encryptedPayload.split(":");
  if (version !== "v1" || !iv || !tag || !encrypted) {
    throw new Error("Unsupported integration credential payload.");
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    integrationSecret(),
    Buffer.from(iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64")),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString("utf8")) as T;
}
