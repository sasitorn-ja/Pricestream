import { neon } from "@neondatabase/serverless";

export function getSql() {
  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || "";
  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL. Add your Neon connection string to .env.");
  }

  return neon(databaseUrl);
}
