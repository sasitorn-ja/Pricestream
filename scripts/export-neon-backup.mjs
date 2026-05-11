import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;

if (!databaseUrl) {
  console.error("Missing DATABASE_URL or NEON_DATABASE_URL.");
  process.exit(1);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputPath = resolve(process.argv[2] ?? `.cache/neon-backups/neon-backup-${timestamp}.json.gz`);
const sql = neon(databaseUrl);

function quoteIdent(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function tableName(table) {
  return `${quoteIdent(table.table_schema)}.${quoteIdent(table.table_name)}`;
}

async function fetchTables() {
  return sql`
    select table_schema, table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
    order by table_schema, table_name
  `;
}

async function fetchSequences() {
  const sequences = await sql`
    select
      sequence_schema,
      sequence_name,
      data_type,
      start_value,
      minimum_value,
      maximum_value,
      increment,
      cycle_option
    from information_schema.sequences
    where sequence_schema = 'public'
    order by sequence_schema, sequence_name
  `;

  return Promise.all(
    sequences.map(async (sequence) => {
      const sequenceSqlName = `${quoteIdent(sequence.sequence_schema)}.${quoteIdent(sequence.sequence_name)}`;
      const [{ last_value: lastValue, is_called: isCalled }] = await sql.query(
        `select last_value, is_called from ${sequenceSqlName}`,
        []
      );

      return {
        ...sequence,
        last_value: lastValue,
        is_called: isCalled,
        createSequenceSql: [
          `create sequence if not exists ${sequenceSqlName}`,
          `as ${sequence.data_type}`,
          `increment by ${sequence.increment}`,
          `minvalue ${sequence.minimum_value}`,
          `maxvalue ${sequence.maximum_value}`,
          `start with ${sequence.start_value}`,
          sequence.cycle_option === "YES" ? "cycle" : "no cycle"
        ].join(" ")
      };
    })
  );
}

async function fetchColumns(table) {
  return sql.query(
    `
      select
        c.column_name,
        c.ordinal_position,
        c.is_nullable,
        c.column_default,
        c.is_identity,
        c.identity_generation,
        format_type(a.atttypid, a.atttypmod) as formatted_type
      from information_schema.columns c
      join pg_namespace n
        on n.nspname = c.table_schema
      join pg_class cls
        on cls.relnamespace = n.oid
       and cls.relname = c.table_name
      join pg_attribute a
        on a.attrelid = cls.oid
       and a.attname = c.column_name
       and a.attnum > 0
       and not a.attisdropped
      where c.table_schema = $1
        and c.table_name = $2
      order by c.ordinal_position
    `,
    [table.table_schema, table.table_name]
  );
}

async function fetchConstraints(table) {
  return sql.query(
    `
      select
        con.conname as constraint_name,
        con.contype as constraint_type,
        pg_get_constraintdef(con.oid, true) as constraint_definition,
        source_ns.nspname as source_schema,
        source_cls.relname as source_table,
        target_ns.nspname as target_schema,
        target_cls.relname as target_table
      from pg_constraint con
      join pg_class source_cls
        on source_cls.oid = con.conrelid
      join pg_namespace source_ns
        on source_ns.oid = source_cls.relnamespace
      left join pg_class target_cls
        on target_cls.oid = con.confrelid
      left join pg_namespace target_ns
        on target_ns.oid = target_cls.relnamespace
      where source_ns.nspname = $1
        and source_cls.relname = $2
      order by
        case con.contype
          when 'p' then 1
          when 'u' then 2
          when 'c' then 3
          when 'f' then 4
          else 5
        end,
        con.conname
    `,
    [table.table_schema, table.table_name]
  );
}

async function fetchIndexes(table) {
  return sql.query(
    `
      select idx.indexname, idx.indexdef
      from pg_indexes idx
      join pg_class index_cls
        on index_cls.relname = idx.indexname
      join pg_namespace index_ns
        on index_ns.oid = index_cls.relnamespace
       and index_ns.nspname = idx.schemaname
      left join pg_constraint con
        on con.conindid = index_cls.oid
      where idx.schemaname = $1
        and idx.tablename = $2
        and con.oid is null
      order by idx.indexname
    `,
    [table.table_schema, table.table_name]
  );
}

function buildCreateTableSql(table, columns) {
  const columnDefs = columns.map((column) => {
    const parts = [quoteIdent(column.column_name), column.formatted_type];
    if (column.is_identity === "YES") {
      parts.push(`generated ${String(column.identity_generation).toLowerCase()} as identity`);
    } else if (column.column_default) {
      parts.push(`default ${column.column_default}`);
    }
    if (column.is_nullable === "NO") {
      parts.push("not null");
    }
    return `  ${parts.join(" ")}`;
  });

  return `create table if not exists ${tableName(table)} (\n${columnDefs.join(",\n")}\n);`;
}

function buildAddConstraintSql(table, constraint) {
  return [
    "do $$",
    "begin",
    "  if not exists (",
    "    select 1",
    "    from pg_constraint con",
    "    join pg_class cls on cls.oid = con.conrelid",
    "    join pg_namespace ns on ns.oid = cls.relnamespace",
    `    where ns.nspname = ${quoteLiteral(table.table_schema)}`,
    `      and cls.relname = ${quoteLiteral(table.table_name)}`,
    `      and con.conname = ${quoteLiteral(constraint.constraint_name)}`,
    "  ) then",
    `    alter table ${tableName(table)} add constraint ${quoteIdent(constraint.constraint_name)} ${constraint.constraint_definition};`,
    "  end if;",
    "end $$;"
  ].join("\n");
}

function quoteLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function makeIndexSqlIdempotent(indexDef) {
  return indexDef
    .replace(/^CREATE UNIQUE INDEX /i, "create unique index if not exists ")
    .replace(/^CREATE INDEX /i, "create index if not exists ");
}

async function fetchRows(table) {
  const [{ count }] = await sql.query(`select count(*)::integer as count from ${tableName(table)}`, []);
  const rows = [];

  for (let offset = 0; offset < count; offset += 1) {
    const page = await sql.query(
      `select to_jsonb(row_data) as row from ${tableName(table)} row_data order by row_data.ctid limit 1 offset $1`,
      [offset]
    );
    if (page[0]) {
      rows.push(page[0]);
    }
  }

  return rows;
}

const [tables, sequences] = await Promise.all([fetchTables(), fetchSequences()]);
const exportedTables = [];

for (const table of tables) {
  const [columns, constraints, indexes, rows] = await Promise.all([
    fetchColumns(table),
    fetchConstraints(table),
    fetchIndexes(table),
    fetchRows(table)
  ]);

  exportedTables.push({
    ...table,
    columns,
    createTableSql: buildCreateTableSql(table, columns),
    constraints: constraints.map((constraint) => ({
      ...constraint,
      addConstraintSql: buildAddConstraintSql(table, constraint)
    })),
    indexes: indexes.map((index) => ({
      ...index,
      createIndexSql: makeIndexSqlIdempotent(index.indexdef)
    })),
    rows: rows.map((row) => row.row)
  });

  console.log(`${table.table_schema}.${table.table_name}: ${rows.length} rows`);
}

const backup = {
  format: "pricestream-neon-json-backup-v1",
  exportedAt: new Date().toISOString(),
  source: {
    database: (await sql`select current_database() as database`)[0]?.database ?? null,
    schema: "public"
  },
  sequences,
  tables: exportedTables
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, gzipSync(JSON.stringify(backup)));

console.log(`Backup written to ${outputPath}`);
