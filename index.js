import sql from 'node-sql-parser'
import { sha256 as hasher } from 'multiformats/hashes/sha2'
import * as codec from '@ipld/dag-cbor'
import { encode as encoder, decode as decoder } from 'multiformats/block'
import { create as createSparseArray, load as loadSparseArray } from 'chunky-trees/sparse-array'
import { create as createDBIndex, load as loadDBIndex } from 'chunky-trees/db-index'

const mf = { codec, hasher }

const encode = value => encoder({ value, ...mf })
const decode = bytes => decoder({ bytes, ...mf })

const immediate = () => new Promise(resolve => setImmediate(resolve))

const getNode = async (cid, get, cache, create) => {
  if (cache.has(cid)) {
    return cache.get(cid)
  }
  const block = await get(cid)
  const node = await create(block)
  cache.set(cid, node)
  return node
}

class SQLBase {
  constructor ({ block }) {
    this.block = block || this.encode()
    this.address = this.block.then ? this.block.then(b => b.cid) : this.block.cid
  }

  async encode () {
    if (this.block) return this.block
    await immediate()
    const node = await this.encodeNode()
    return encode(node)
  }
}

class Column extends SQLBase {
  constructor ({ schema, index, ...opts }) {
    super(opts)
    this.name = schema.column.column
    this.definition = schema.definition
    this.schema = schema
    this.index = index
  }

  async encodeNode () {
    const index = this.index === null ? null : await this.index.address
    return { schema: this.schema, index }
  }

  static create (schema) {
    return new Column({ schema, index: null })
  }

  static from (cid, { get, cache, chunker }) {
    const create = async (block) => {
      let { schema, index } = block.value
      if (index !== null) {
        index = await loadDBIndex({ cid: index, get, cache, chunker, ...mf })
      }
      return new Column({ index, schema, get, cache, block })
    }
    return getNode(cid, get, cache, create)
  }
}

const validate = (schema, val) => {
  const { dataType, length } = schema.definition
  const { type, value } = val
  if (value.length > length) throw new Error('Schema validation: value too long')
  if (type === 'string' && dataType === 'VARCHAR') return true
  if (type === 'number' && dataType === 'INT') return true
  throw new Error('Not Implemented')
}

class Row {
  constructor ({ block, table }) {
    this.block = block
    this.value = block.value
    this.props = table.columns.map(col => col.schema)
  }

  get address () {
    return this.block.cid
  }

  getIndex (i) {
    return this.value[i]
  }

  get (columnName) {
    if (Array.isArray(this.value)) {
      // TODO: optimize this find to use only a single iteration
      const i = this.props.findIndex(p => p.column.column === columnName)
      if (i === -1) throw new Error(`No column named "${columnName}"`)
      return this.value[i]
    } else {
      return this.value[columnName]
    }
  }

  columns (query) {
    if (query === '*') {
      return this.toArray()
    } else if (Array.isArray(query)) {
      const result = []
      for (const { expr, as } of query) {
        if (as !== null) throw new Error('Not Implmented')
        if (expr.type !== 'column_ref') throw new Error('Not Implmented')
        if (expr.table !== null) throw new Error('Not Implemented')
        result.push(this.get(expr.column))
      }
      return result
    } else {
      throw new Error('Not Implemented')
    }
  }

  toArray () {
    if (Array.isArray(this.value)) {
      return this.value
    } else {
      throw new Error('Unsupported')
    }
  }

  toObject () {
    throw new Error('no implemented')
    // this is not finished
    if (Array.isArray(this.value)) {
      const props = [...this.props()]
    } else {
      throw new Error('Unsupported')
    }
  }
}

const tableInsert = async function * (table, ast, { database, chunker }) {
  if (ast.columns !== null) throw new Error('Not implemented')
  const { get, cache } = database
  const { values } = ast
  const inserts = []
  const schemas = table.columns.map(col => col.schema)
  for (const { type, value } of values) {
    const row = []
    if (type !== 'expr_list') throw new Error('Not implemented')
    for (let i = 0; i < value.length; i++) {
      const schema = schemas[i]
      const val = value[i]
      validate(schema, val)
      row.push(val.value)
    }
    const block = await encode(row)
    yield block
    const _row = new Row({ block, table })
    cache.set(_row.address, _row)
    inserts.push({ block, row: _row })
  }
  const opts = { chunker, get, cache, ...mf }
  if (table.rows === null) {
    let i = 1
    const list = inserts.map(({ block: { cid }, row }) => ({ key: i++, value: cid, row }))
    let rows

    for await (const node of createSparseArray({ list, ...opts })) {
      yield node.block
      rows = node
    }
    let blocks = []
    const writeIndex = async (column, i) => {
      const entries = []
      for (const { key, value, row } of list) {
        const val = row.getIndex(i)
        entries.push({ key: [val, key], row, value: row.address })
      }
      let index
      for await (const node of createDBIndex({ list: entries, ...opts })) {
        blocks.push(node.block)
        index = node
      }
      return index
    }
    const promises = table.columns.map((...args) => writeIndex(...args))
    const pending = new Set(promises)
    promises.forEach(p => p.then(() => pending.delete(p)))
    while (pending.size) {
      await Promise.race([...pending])
      yield * blocks
      blocks = []
    }
    const indexes = await Promise.all(promises.map(p => p.then(index => index.address)))
    const node = await table.encodeNode()
    node.rows = await rows.address
    node.columns = []
    const columns = await Promise.all(table.columns.map(c => c.encodeNode()))
    while (columns.length) {
      const col = columns.shift()
      col.index = await indexes.shift()
      const block = await encode(col)
      yield block
      node.columns.push(block.cid)
    }
    const newTable = await encode(node)
    yield newTable
    const dbNode = await database.encodeNode()
    dbNode.tables[table.name] = newTable.cid
    yield encode(dbNode)
  }
}

const rangeOperators = new Set(['<', '>', '<=', '>='])

const getRangeQuery = ({ operator, value, right }, column) => {
  const { dataType } = column.schema.definition
  let incr
  if (dataType === 'INT') {
    incr = 1
  } else if (dataType === 'VARCHAR') {
    incr = '\x00'
  } else {
    throw new Error('Not Implmented')
  }

  if (typeof value === 'undefined') value = right.value

  if (operator === '>=') {
    return { start: value }
  } else if (operator === '<=') {
    return { end: value + incr }
  } else if (operator === '>') {
    return { start: value + incr }
  } else if (operator === '<') {
    return { end: value }
  } else {
    /* c8 ignore next */
    throw new Error('Internal Error: invalid operator')
  }
}

const absoluteStart = ({ schema: { definition: { dataType, length } } }) => {
  if (dataType === 'INT') return -1
  if (dataType === 'VARCHAR') {
    return [...Array(length).keys()].map(() => '\x00').join('')
  }
  throw new Error('Not Implemented')
}
const absoluteEnd = ({ schema: { definition: { dataType, length } } }) => {
  if (dataType === 'INT') return Infinity
  if (dataType === 'VARCHAR') {
    return Buffer.from([...Array(length + 1).keys()].map(() => 255)).toString()
  }
  throw new Error('Not Implemented')
}

class Where {
  constructor (db, ast, table) {
    this.db = db
    this.ast = ast
    this.table = table
  }

  async all () {
    const where = this.ast
    const { table, db } = this
    if (where.type !== 'binary_expr') throw new Error('Not Implemented')
    if (where.left.table) throw new Error('Not Implemented')

    let results
    if (where.operator === 'AND' || where.operator === 'OR') {
      // fast path for range query
      if (where.left.left.column && where.left.left.column === where.right.left.column) {
        if (!rangeOperators.has(where.left.operator) ||
            !rangeOperators.has(where.right.operator)
        ) {
          throw new Error('Invalid SQL, must compare same column using >, <, >=, or <=')
        }
        const column = table.getColumn(where.left.left.column)
        const query = { ...getRangeQuery(where.left, column), ...getRangeQuery(where.right, column) }
        const { start, end } = query
        if (typeof start === 'undefined' || typeof end === 'undefined') {
          throw new Error('Invalid operator combination, missing start or end')
        }
        return column.index.getRangeEntries([start, 0], [end, 0])
      }

      const left = new Where(db, where.left, table)
      const right = new Where(db, where.right, table)
      const [ll, rr] = await Promise.all([left.asMap(), right.asMap()])
      if (where.operator === 'OR') {
        const all = new Map([...ll.entries(), ...rr.entries()])
        results = [...all.keys()].sort().map(k => ({ key: k, value: all.get(k) }))
      } else {
        results = [...ll.keys()].filter(k => rr.has(k)).map(k => {
          return { key: k, value: ll.get(k) }
        })
      }
    } else if (where.operator === '=') {
      const { index } = table.getColumn(where.left.column)
      const { value } = where.right
      results = await index.getRangeEntries([value, 0], [value, Infinity])
    } else if (rangeOperators.has(where.operator)) {
      const column = table.getColumn(where.left.column)
      let { start, end } = getRangeQuery(where, column)
      if (typeof start === 'undefined') start = absoluteStart(column)
      if (typeof end === 'undefined') end = absoluteEnd(column)
      results = await column.index.getRangeEntries([start, 0], [end, 0])
    } else {
      throw new Error('Not Implemented')
    }
    return results
  }

  async asMap () {
    const results = await this.all()
    return new Map(results.map(r => {
      if (Array.isArray(r.key)) return [r.key[1], r.value]
      return [r.key, r.value]
    }))
  }
}

class Table extends SQLBase {
  constructor ({ name, rows, columns, ...opts }) {
    super(opts)
    this.name = name
    this.rows = rows
    this.columns = columns
  }

  getColumn (columnName) {
    return this.columns.find(c => c.name === columnName)
  }

  async encodeNode () {
    const columns = await Promise.all(this.columns.map(column => column.address))
    const rows = this.rows === null ? null : await this.rows.address
    return { columns, rows }
  }

  insert (ast, opts) {
    return tableInsert(this, ast, opts)
  }

  static create (columnSchemas) {
    const columns = columnSchemas.map(schema => Column.create(schema))
    const table = new Table({ rows: null, columns })
    return table
  }

  static from (cid, name, { get, cache, chunker }) {
    const create = async (block) => {
      let { columns, rows } = block.value
      const promises = columns.map(cid => Column.from(cid, { get, cache, chunker }))
      if (rows !== null) {
        rows = loadSparseArray({ cid: rows, cache, get, chunker, ...mf })
      }
      columns = await Promise.all(promises)
      rows = await rows
      return new Table({ name, columns, rows, get, cache, block })
    }
    return getNode(cid, get, cache, create)
  }
}

const createTable = async function * (database, ast) {
  const [{ table: name }] = ast.table
  const table = Table.create(ast.create_definitions)
  const columns = await Promise.all(table.columns.map(column => column.encode()))
  yield * columns

  const tableBlock = await table.encode()
  yield tableBlock

  const node = await database.encodeNode()
  node.tables[name] = tableBlock.cid
  yield encode(node)
}

const { entries, fromEntries } = Object

class Database extends SQLBase {
  constructor ({ tables, get, cache, ...opts }) {
    super(opts)
    this.get = get
    this.cache = cache
    this.tables = tables
  }

  createTable (ast) {
    return createTable(this, ast)
  }

  async encodeNode () {
    const promises = entries(this.tables).map(async ([key, value]) => {
      return [key, await value.address]
    })
    const tables = fromEntries(await Promise.all(promises))
    return { tables }
  }

  static create (opts) {
    return new Database({ tables: {}, ...opts })
  }

  static async from (cid, { get, cache, chunker }) {
    const create = async (block) => {
      let { tables } = block.value
      const promises = entries(tables).map(async ([key, cid]) => {
        return [key, await Table.from(cid, key, { get, cache, chunker })]
      })
      tables = fromEntries(await Promise.all(promises))
      return new Database({ tables, get, cache, block })
    }
    return getNode(cid, get, cache, create)
  }

  sql (q, opts) {
    return sqlQuery(q, { ...opts, database: this })
  }
}

const parse = query => (new sql.Parser()).astify(query)

const notsupported = select => {
  const keys = [
    'options',
    'distinct',
    'groupby',
    'having',
    'limit',
    'for_update'
  ]
  keys.forEach(key => {
    if (select[key] !== null) throw new Error(`Not supported "${key}"`)
  })
}

const runSelect = async function * (select) {
  for await (const { entry, table } of select.where()) {
    const result = await select.columns(entry, table)
    yield { entry, table, ...result }
  }
}

const runWhere = async function * (select) {
  const tables = select.ast.from.map(({ table }) => select.db.tables[table])
  if (select.ast.where === null) {
    for (const table of tables) {
      for await (const entry of table.rows.getAllEntries()) {
        yield { entry, table }
      }
    }
  } else {
    for (const table of tables) {
      const w = new Where(select.db, select.ast.where, table)
      const results = await w.all()
      yield * results.map(entry => ({ entry, table }))
    }
  }
}

const filterResults = async function * (results, name) {
  for await (const r of results) {
    yield r[name]
  }
}

class Select {
  constructor (db, ast) {
    notsupported(ast)
    this.db = db
    this.ast = ast
  }

  async columns (entry, table) {
    const { value } = entry
    const { get, cache } = this.db
    const create = block => new Row({ block, table })
    const row = await getNode(value, get, cache, create)
    return { row, columns: row.columns(this.ast.columns) }
  }

  where () {
    return runWhere(this)
  }

  run () {
    return runSelect(this)
  }

  async _all () {
    let results = []
    for await (const result of this.run()) {
      results.push(result)
    }
    if (this.ast.orderby) {
      results = results.sort((a, b) => {
        for (const order of this.ast.orderby) {
          if (order.expr.type !== 'column_ref') throw new Error('Not Implemented')
          const { column } = order.expr
          const [aa, bb] = [a.row.get(column), b.row.get(column)]
          if (aa < bb) return order.type === 'ASC' ? -1 : 1
          if (aa > bb) return order.type === 'ASC' ? 1 : -1
        }
        return 0
      })
    }
    return results
  }

  async all () {
    const results = await this._all()
    return results.map(r => r.columns)
  }
}

const exec = (ast, { database, chunker }) => {
  const { keyword, type } = ast
  if (keyword === 'table') {
    if (type === 'create') {
      const columnSchemas = ast.create_definitions
      if (!database) throw new Error('No database to create table in')
      return database.createTable(ast)
    }
    throw new Error('Not implemented')
  }
  if (type === 'insert') {
    if (!database) throw new Error('No database to create table in')
    const [{ db, table: name }] = ast.table
    if (db !== null) throw new Error('Not implemented')
    const table = database.tables[name]
    if (!table) throw new Error(`Missing table '${name}'`)
    return table.insert(ast, { database, chunker })
  }
  if (type === 'select') {
    return new Select(database, ast)
  }
  throw new Error('Not implemented')
}

const sqlQuery = (q, opts) => exec(parse(q), opts)

export { Database, Table, Column, exec, sqlQuery as sql }
