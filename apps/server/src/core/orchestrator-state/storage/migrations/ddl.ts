export const SCHEMA_MIGRATIONS_DDL = `
  CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )
`;

export { FINAL_SCHEMA_DDL } from "./final-schema.js";
