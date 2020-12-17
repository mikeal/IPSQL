# IPSQL

IPSQL is a decentralized database that can run in IPFS. It implements the SQL schema, data model,
and query language.

This project is pre-alpha and under heavy active development. Do not use in production, breaking
changes will land without notice.


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
