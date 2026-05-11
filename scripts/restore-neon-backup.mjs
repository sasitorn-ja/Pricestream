import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { neon } from "@neondatabase/serverless";

const inputPath = process.argv[2];
const shouldClear = process.argv.includes("--clear");
const databaseUrl =
  process.env.RESTORE_DATABASE_URL ||
  process.env.DEST_DATABASE_URL ||
  process.env.TARGET_DATABASE_URL;

if (!inputPath) {
  console.error("Usage: RESTORE_DATABASE_URL='postgres://...' node scripts/restore-neon-backup.mjs <backup.json.gz> [--clear]");
  process.exit(1);
}

if (!databaseUrl) {
  console.error("Missing RESTORE_DATABASE_URL, DEST_DATABASE_URL, or TARGET_DATABASE_URL. Refusing to restore into DATABASE_URL by default.");
  process.exit(1);
}

const sql = neon(databaseUrl);
const backupBuffer = await readFile(resolve(inputPath));
const backupText = inputPath.endsWith(".gz")
  ? gunzipSync(backupBuffer).toString("utf8")
  : backupBuffer.toString("utf8");
const backup = JSON.parse(backupText);

if (backup.format !== "pricestream-neon-json-backup-v1") {
  console.error(`Unsupported backup format: ${backup.format ?? "(missing)"}`);
  process.exit(1);
}

function quoteIdent(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function tableName(table) {
  return `${quoteIdent(table.table_schema)}.${quoteIdent(table.table_name)}`;
}

function orderedTablesForInsert(tables) {
  const byKey = new Map(tables.map((table) => [`${table.table_schema}.${table.table_name}`, table]));
  const dependencies = new Map(tables.map((table) => [`${table.table_schema}.${table.table_name}`, new Set()]));

  for (const table of tables) {
    const key = `${table.table_schema}.${table.table_name}`;
    for (const constraint of table.constraints ?? []) {
      if (constraint.constraint_type !== "f" || !constraint.target_schema || !constraint.target_table) {
        continue;
      }
      const targetKey = `${constraint.target_schema}.${constraint.target_table}`;
      if (byKey.has(targetKey) && targetKey !== key) {
        dependencies.get(key)?.add(targetKey);
      }
    }
  }

  const ordered = [];
  const temporary = new Set();
  const permanent = new Set();

  function visit(key) {
    if (permanent.has(key)) return;
    if (temporary.has(key)) return;
    temporary.add(key);
    for (const dependency of dependencies.get(key) ?? []) {
      visit(dependency);
    }
    temporary.delete(key);
    permanent.add(key);
    ordered.push(byKey.get(key));
  }

  for (const key of byKey.keys()) {
    visit(key);
  }

  return ordered.filter(Boolean);
}

async function insertRows(table) {
  if (!table.rows?.length) {
    return;
  }

  const columns = table.columns.map((column) => column.column_name);
  const columnSql = columns.map(quoteIdent).join(", ");
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
  const insertSql = `insert into ${tableName(table)} (${columnSql}) values (${placeholders})`;

  for (const row of table.rows) {
    const values = columns.map((column) => {
      const value = row[column];
      return value && typeof value === "object" ? JSON.stringify(value) : value;
    });
    await sql.query(insertSql, values);
  }
}

console.log(`Restoring backup exported at ${backup.exportedAt}`);
console.log(`Target database: ${(await sql`select current_database() as database`)[0]?.database ?? "(unknown)"}`);

await sql`create schema if not exists public`;

for (const sequence of backup.sequences ?? []) {
  await sql.query(sequence.createSequenceSql, []);
}

for (const table of backup.tables) {
  await sql.query(table.createTableSql, []);
}

if (shouldClear) {
  for (const table of [...backup.tables].reverse()) {
    await sql.query(`truncate table ${tableName(table)} restart identity cascade`, []);
  }
}

for (const table of orderedTablesForInsert(backup.tables)) {
  await insertRows(table);
  console.log(`${table.table_schema}.${table.table_name}: restored ${table.rows.length} rows`);
}

for (const table of backup.tables) {
  for (const constraint of table.constraints ?? []) {
    if (constraint.constraint_type === "f") {
      continue;
    }
    await sql.query(constraint.addConstraintSql, []);
  }
}

for (const table of backup.tables) {
  for (const constraint of table.constraints ?? []) {
    if (constraint.constraint_type !== "f") {
      continue;
    }
    await sql.query(constraint.addConstraintSql, []);
  }
}

for (const table of backup.tables) {
  for (const index of table.indexes ?? []) {
    await sql.query(index.createIndexSql, []);
  }
}

for (const sequence of backup.sequences ?? []) {
  await sql.query(
    `select setval($1::regclass, $2::bigint, $3::boolean)`,
    [`${sequence.sequence_schema}.${sequence.sequence_name}`, sequence.last_value, sequence.is_called]
  );
}

console.log("Restore complete.");
