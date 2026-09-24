import "server-only";
import { createHash, randomBytes } from "node:crypto";

// Invitation tokens: 256 random bits in the link, only the SHA-256 stored in the DB.
export const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
