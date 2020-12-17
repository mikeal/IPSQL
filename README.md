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
    - [ ] BOOLEAN
    - [ ] BLOB
    - [ ] FLOAT
    - [ ] DATE
- INSERT
  - [x] ROWS `INSERT INTO table_name VALUES ( 'test' )
  - [x] COLUMNS `INSERT INTO table_name ( column_name ) VALUES ( 'test' )`
- [ ] UPDATE
- SELECT
  - [x] * `SELECT * FROM table_name`
  - [x] COLUMNS `SELECT column1, column2 FROM table_name`
  - [ ] ROWID meta column
  - WHERE
    - [x] AND
    - [x] OR
    - [x] ASC, DESC
    - [x] basic comparison (=, >, <, >=, <=)
    - [ ] <>
    - [x] ORDER BY
    - [ ] BETWEEN
    - [ ] LIKE
    - [ ] IN
    - [ ] NOT
    - [ ] IS NOT NULL, IS NULL
  - [ ] JOIN

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
