// 로컬 MySQL → SQL dump 파일 생성
import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "dump.sql");

async function dump() {
  const conn = await mysql.createConnection({
    host: "127.0.0.1",
    port: 3306,
    user: "root",
    password: "1234",
    database: "lost_ark",
    multipleStatements: true,
  });

  const [tables] = await conn.query(`SHOW TABLES`);
  const tableKey = Object.keys(tables[0])[0];
  const tableNames = tables.map((r) => r[tableKey]);

  let sql = `SET FOREIGN_KEY_CHECKS=0;\nSET NAMES utf8mb4;\n\n`;

  for (const table of tableNames) {
    console.log(`Dumping ${table}...`);

    // CREATE TABLE
    const [[{ "Create Table": createSql }]] = await conn.query(
      `SHOW CREATE TABLE \`${table}\``,
    );
    sql += `DROP TABLE IF EXISTS \`${table}\`;\n`;
    sql += createSql + ";\n\n";

    // INSERT DATA
    const [rows] = await conn.query(`SELECT * FROM \`${table}\``);
    if (rows.length === 0) continue;

    const cols = Object.keys(rows[0])
      .map((c) => `\`${c}\``)
      .join(", ");
    const chunkSize = 200;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const vals = chunk
        .map((row) => {
          const v = Object.values(row).map((val) => {
            if (val === null) return "NULL";
            if (typeof val === "number") return val;
            if (val instanceof Date)
              return `'${val.toISOString().slice(0, 19).replace("T", " ")}'`;
            return `'${String(val).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
          });
          return `(${v.join(", ")})`;
        })
        .join(",\n  ");
      sql += `INSERT IGNORE INTO \`${table}\` (${cols}) VALUES\n  ${vals};\n`;
    }
    sql += "\n";
  }

  sql += `SET FOREIGN_KEY_CHECKS=1;\n`;

  fs.writeFileSync(OUT, sql, "utf8");
  console.log(
    `\n✅ Done → ${OUT} (${(fs.statSync(OUT).size / 1024 / 1024).toFixed(2)} MB)`,
  );
  await conn.end();
}

dump().catch((e) => {
  console.error(e);
  process.exit(1);
});
