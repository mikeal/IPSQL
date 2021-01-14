# DAG Tables

A DAG table is essentially a table for rows of JSON data.

DAG is an acronym for "Directed Acyclic Graph." It's a fancy word for
a merkle tree with deduplication.

This means that, in addition to storing single objects as rows you can also
link from these objects to other JSON-like objects. This allows rows
that point at common data to de-deplicate that data across the entire
database.

DAG Tables operate much the same way that regular tables work. Each insertion
creates a new row with a new `rowid`.

DAG Table rows do not have to conform to any schema, they are completely unstructured.
You can create column indexes out of any property anywhere in the DAG by adding a schema
to the row.

```js
const example = {
  one: {
    two: {
      name: 'Test'
    }
    three: {
      prop: 'hello'
    }
  }
}

const schema = '`one/two/name` VARCHAR(256)'
const ipsql = await IPSQL.create({ dt: { create: { name: 'mytable', schema } } }, opts)
```

When creating a schema for a DAG table you can use paths. For instance, if you want to index
the "name" property in the example object you would use the column name `\`one/two/name\`` (note
the use of \` is required when using `/` in SQL column names.

Rows that do not contain this property path will not appear in the column index.

You can now use queries for this property.

```
SELECT `three/prop` from mytable WHERE `one/two/name` = 'Test'
```

You must include a schema in order to use `WHERE` on the `one/two/name` property but
you can select **any** property in the row. This is because column `SELECT` is done
on the final row rather than relying on any pre-computed index. This gives optimal flexibility
and keeps writes to the database fast by limiting the number of column indexes necessary
for many queries.
