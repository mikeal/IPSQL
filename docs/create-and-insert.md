# CREATE and INSERT on the command line

You can create and mutate databases using the command line.

By default, all mutation operations print the `CID` (hash address) of the
resulting mutation.

If you want to store the resulting database you'll need to use the `--export` option.

## ipsql create

To create a new database from a SQL statement you can use the `create` command.

```
$ ipsql create
ipsql create <sql>

Create a new database

Positionals:
  sql  SQL query string to run                                        [required]

Options:
  --help     Show help                                                 [boolean]
  --version  Show version number                                       [boolean]
  --export   Export blocks for query
```

### ipsql create --export

```
$ ipsql create 'CREATE TABLE People (first VARCHAR(255), last VARCHAR(255))' --export=new.car
bafyreid3uk7luonlqhguuhkmnx3vurslfvzigah7gomdxpjecmdxgchbsm
```

## ipsql write

To perform mutation operations on an existing database you can use the `write` command.

You can use any supported [storage uri]('./storage-uris') as `input`.

```
$ ipsql write
ipsql write <uri> <sql>

Mutate an existing SQL database

Positionals:
  URI  URI for database
  sql  SQL query string to run                                        [required]

Options:
  --help     Show help                                                 [boolean]
  --version  Show version number                                       [boolean]
  --export   Export blocks for query
  --patch    Export only new blocks                   [boolean] [default: false]
```

### ipsql write --export

```
$ ipsql write database.car 'INSERT INTO People VALUES ("mikeal", "rogers")' --export=db-with-inserts.car
bafyreibvkiz44m6wkty2ugeypg33rw2qqzgo5omwvhsnv3t43apzjvhozq
```

This exports the entire database, not just the changes, and can now be queried.

```
$ ipsql query db-with-inserts.car 'SELECT * from People'
"mikeal","rogers"
```

You can also export **only** the patch for the mutation you're performing. This will only export the
blocks that are created by the given mutation.

```
$ ipsql write database.car 'INSERT INTO People VALUES ("mikeal", "rogers")' --export=patch.car --patch
bafyreibvkiz44m6wkty2ugeypg33rw2qqzgo5omwvhsnv3t43apzjvhozq
```
