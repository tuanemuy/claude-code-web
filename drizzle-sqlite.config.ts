import "dotenv/config";
import path from "node:path";
import { defineConfig } from "drizzle-kit";

const fileName = process.env.DATABASE_FILE_NAME;

if (!fileName) {
  throw new Error("DATABASE_FILE_NAME environment variable is not set.");
}

const filePath = path.join(
  import.meta.dirname,
  "src/core/adapters/drizzleSqlite",
  fileName,
);

export default defineConfig({
  out: "./src/core/adapters/drizzleSqlite/migrations",
  schema: "./src/core/adapters/drizzleSqlite/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: `file:${filePath}`,
  },
});
