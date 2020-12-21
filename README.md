# IPSQL

IPSQL is a decentralized database that can run in IPFS. It implements the SQL schema, data model,
and query language.

This project is pre-alpha and under heavy active development. Do not use in production, breaking
changes will land without notice.

# SQL Feature Checklist

- CREATE
  - [ ] DATABASE (it isn't clear how we would want to implement and support this yet)
  - TABLE
    - [x] INTEGER
    - [x] VARCHAR(size)
    - [x] FLOAT
    - [ ] DATE
    - [ ] TIME
    - [ ] DATETIME
    - [ ] BLOB (should use the FBL, values smaller than 32b will be inline binary, below 1MB should
                be a single raw block link, anything else is a full tree FBL as a stream)
    - [ ] TEXT (may never support, according to spec this is upt 2GB of string data so it's hard
                to figure out what the inline vs linking rules would be. Instead, using VARCHAR
                as the inlined string and BLOB the *probably* linked type)
    - [ ] BOOLEAN (this isn't actually supported in the SQL parser we use, must be quite rare)
- [ ] ALTER TABLE
- INSERT
  - [x] ROWS `INSERT INTO table_name VALUES ( 'test' )`
  - [x] COLUMNS `INSERT INTO table_name ( column_name ) VALUES ( 'test' )`
- UPDATE
  - [x] UPDATE SET w/o WHERE
  - [x] UPDATE SET WHERE
- DELETE
  - [ ] DELETE w/o WHERE (deletes table)
  - [ ] DELETE WHERE
- SELECT
  - [x] * `SELECT * FROM table_name`
  - [x] COLUMNS `SELECT column1, column2 FROM table_name`
  - [ ] ROWID meta column
  - [ ] TOP
  - [ ] MIN
  - [ ] MAX
  - [ ] COUNT
  - [ ] AVG
  - [ ] SUM
  - [ ] LIKE *pattern*
  - WHERE
    - [x] AND
    - [x] OR
    - [x] ASC, DESC
    - [x] basic comparison (=, >, <, >=, <=)
    - [ ] <>
    - [ ] GROUP BY
    - [x] ORDER BY
    - [ ] BETWEEN
    - [ ] LIKE
    - [ ] IN
    - [ ] NOT
    - [ ] IS NOT NULL, IS NULL
  - [ ] JOIN
  - [ ] ORDER BY
  - [ ] GROUP BY
  - [ ] HAVING
  - UNION

### IPLD Schema

```sh
type Column {
  schema &Map
  index nullable &DBIndex
}
type Columns { String: Column }

type Table struct {
  columns Columns
  rows nullable &SparseArray
}
type Tables { String: Table }

type Database struct {
  tables Tables
}
```
