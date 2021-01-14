# IPSQL

IPSQL is a decentralized database that can run in IPFS. It implements the SQL schema, data model,
and query language.

This project is pre-alpha and under heavy active development. Do not use in production, breaking
changes will land without notice.

# CLI

The primary way to interact with IPSQL right now is via the command line. You can install it with
`npm` or use `npx` to run it without installing locally.

```
$ ipsql help
ipsql [command]

Commands:
  ipsql query <uri> <sql>    Run IPSQL query
  ipsql repl <uri>           Run local REPL
  ipsql create <sql>         Create a new database
  ipsql write <uri> <sql>    Mutate an existing SQL database
  ipsql import <subcommand>  Import CSV files
  ipsql keygen <subcommand>  Generate keys for encryption

Options:
  --help     Show help                                                 [boolean]
  --version  Show version number                                       [boolean]
```

The JS API is currently considered internal until the churn in the code base dies down.

* Features
  * Traditional SQL [CREATE, UPDATE, SELECT, WHERE, etc](#sql-feature-checklist).
  * Deltas and proofs for every database operation and query.
    * You can replicate the data for only a single query as hash linked blocks.
    * Every mutation creates deltas to prior states and even query deltas can
      be replicated.
  * Optional Encryption
  * [DAG Tables](./doc/dag-tables.md) (JSON-like unstructured objects as rows, with column indexing an SQL queries still available)
* CLI
  * [Importing CSV files](./doc/importing-csv.md)
  * [Importing JSON files (into DAG tables)](./doc/importing-json.md)
  * [CREATE and INSERT](./doc/create-and-insert.md)
  * [Encrypting and Decrypting databases](./doc/encryption.md)

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
  - [x] MIN
  - [x] MAX
  - [x] COUNT
  - [x] AVG
  - [x] SUM
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
  - [x] ORDER BY
  - [ ] GROUP BY
  - [ ] HAVING
  - [ ] UNION

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
