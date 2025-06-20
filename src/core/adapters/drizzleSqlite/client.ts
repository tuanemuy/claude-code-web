import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

export function getDatabase(fileName: string) {
  const filePath = path.join(import.meta.dirname, fileName);

  return drizzle({
    client: createClient({
      url: `file:${filePath}`,
    }),
    schema,
  });
}

interface DatabaseError {
  code: string;
}

export function isDatabaseError(value: unknown): value is DatabaseError {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  if ("code" in value) {
    return true;
  }

  return false;
}
