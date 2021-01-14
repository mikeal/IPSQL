import sql from 'node-sql-parser'
import { Table, Row, Column, registry } from './table.js'
import { encode, mf } from './utils.js'

const parse = query => (new sql.Parser()).astify(query)

class DAGTable extends Table {
  get tableType () {
    return 'dag'
  }

  createRow (opts) {
    return new DAGRow({ ...opts, table: this })
  }

  static create (columnSchemas) {
    const columns = columnSchemas.map(schema => Column.create(schema))
    const table = new DAGTable({ rows: null, columns, type: 'dag' })
    return table
  }
}

class DAGRow extends Row {
  getIndex (i) {
    const columnName = this.allColumnNames()[i]
    return this.get(columnName)
  }

  get (columnName) {
    if (columnName.includes('/')) {
      const props = columnName.split('/').filter(x => x)
      let { value } = this
      while (props.length) {
        if (value.asCID === value) return { link: value, path: props }
        if (typeof value !== 'object') return undefined
        let key = props.shift()
        if (props.length === 0 && key === '*' && Array.isArray(value)) return value
        if (Array.isArray(value)) {
          key = parseInt(key)
        }
        value = value[key]
        if (typeof value === 'undefined') return value
      }
      if (typeof value === 'object') return undefined // cannot return complex objects
      return value
    }
    return this.value[columnName]
  }

  toObject () {
    return this.value
  }
}

registry.dag = DAGTable

class DAGAPI {
  constructor (ipsql) {
    this.ipsql = ipsql
  }

  async get (name, i, full) {
    const table = this.ipsql.db.tables[name]
    if (!table) throw new Error(`No table named ${name}`)
    const { result, cids } = await table.get(i, this.ipsql.getBlock)
    if (full) return { result, cids }
    return result.block.value
  }

  insert (name, inserts) {
    if (!Array.isArray(inserts)) inserts = [inserts]
    return this.ipsql.write({ dt: { insert: { name, inserts } } })
  }

  async * write ({ create, insert }) {
    const { get, db } = this.ipsql
    const { chunker, cache } = db
    if (create) {
      const { name, columns: columnString } = create
      const rand = Math.random().toString()
      const sql = `CREATE TABLE STUB ( \`${rand}\` VARCHAR(255)${columnString ? ', ' + columnString : ' '})`
      const ast = parse(sql)
      const columns = []
      ast.create_definitions.shift()
      for (const schema of ast.create_definitions) {
        const column = Column.create(schema)
        yield column.encode()
        columns.push(column)
      }
      const table = new DAGTable({ rows: null, columns })
      const tableBlock = await table.encode()
      yield tableBlock
      const obj = await db.encodeNode()
      obj.tables = { ...obj.tables }
      obj.tables[name] = tableBlock.cid
      yield encode(obj)
      return
    }
    if (insert) {
      const { name, inserts } = insert
      const table = this.ipsql.db.tables[name]
      if (!table) throw new Error(`No table named ${name}`)
      const _inserts = []
      for await (const insert of inserts) {
        if (insert.row && insert.row.isRow) return _inserts.push(insert)
        let block
        if (insert.asBlock === insert) {
          block = insert
        } else {
          // we only yield blocks when we encode them, if you pass
          // your own blocks to insert you'll need to put them in the block
          // store yourself as well
          block = await encode(insert)
          yield block
        }
        _inserts.push({ block, row: new DAGRow({ block, table }) })
      }
      const opts = { chunker, get, cache, ...mf }
      yield * table._insert({ opts, table, get, cache, inserts: _inserts, database: this.ipsql.db })
      return
    }
    throw new Error('Not implemented')
  }
}

export { DAGTable, DAGAPI }
