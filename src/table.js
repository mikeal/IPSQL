import { create as createSparseArray, load as loadSparseArray } from 'chunky-trees/sparse-array'
import { create as createDBIndex, load as loadDBIndex } from 'chunky-trees/db-index'

import { encode, mf, SQLBase, getNode } from './utils.js'

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
    this.table = table
  }

  get props () {
    return this.table.columns.map(col => col.schema)
  }

  get address () {
    return this.block.cid
  }

  async update (ast) {
    let obj = this.toObject()
    for (const change of ast.set) {
      const schema = this.props.find(c => c.column.column === change.column)
      validate(schema, change.value)
      obj[change.column] = change.value.value
    }
    let block
    for (const { column: { column } } of this.props) {
      if (typeof column === 'undefined') {
        block = await encode(obj)
        break
      }
    }
    if (!block) {
      obj = this.allColumnNames().map(name => obj[name])
      block = await encode(obj)
    }
    return new Row({ block, table: this.table })
  }

  async rdiff (cid, get, cache) {
    // reverse diff, returns the old values of CID compared to this
    let block
    if (cache.has(cid)) {
      block = cache.get(cid).block
    } else {
      block = await get(cid)
    }
    const row = new Row({ block, table: this.table })
    const changes = {}
    for (const name of this.allColumnNames()) {
      const [ a, b ] = [ this.get(name), row.get(name) ]
      if (a !== b) changes[name] = b
    }
    return changes
  }

  allColumnNames () {
    return this.props.map(column => column.column.column)
  }

  getIndex (i) {
    if (!Array.isArray(this.value)) {
      const columnName = this.allColumnNames()[i]
      return this.value[columnName]
    }
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
        if (as !== null) throw new Error('Not Implemented')
        if (expr.type !== 'column_ref') throw new Error('Not Implemented')
        if (expr.table !== null) throw new Error('Not Implemented')
        result.push(this.get(expr.column))
      }
      return result
    } else {
      throw new Error('Not Implemented')
    }
  }

  toArray (columns) {
    if (Array.isArray(this.value)) {
      return this.value
    } else {
      if (!columns) {
        columns = this.allColumnNames()
      }
      return columns.map(name => this.value[name])
    }
  }

  toObject () {
    if (Array.isArray(this.value)) {
      const values = [...this.value]
      const entries = this.allColumnNames().map(k => [k, values.shift()])
      return Object.fromEntries(entries)
    } else {
      return this.value
    }
  }
}

const tableInsert = async function * (table, ast, { database, chunker }) {
  const { get, cache } = database

  const { values } = ast
  const inserts = []
  const schemas = table.columns.map(col => col.schema)
  if (ast.type === 'update') {
    // TODO: replace this with a more advanced update
    // in the tree so that we don't have to do two traversals
    if (ast.where) throw new Error('Not implemented')
    const entries = await table.rows.getAllEntries()
    const blocks = []
    const _doEntry = async entry => {
      let row = await table.getRow(entry.value, get, cache)
      row = await row.update(ast)
      if (!entry.value.equals(await row.address)) {
        cache.set(row)
        blocks.push(row.block)
        inserts.push({ block: row.block, row, rowid: entry.key })
      }
    }
    await Promise.all(entries.map(_doEntry))
    yield * blocks
  } else {
    for (const { type, value } of values) {
      let row
      if (ast.columns) {
        row = {}
      } else {
        row = []
      }
      if (type !== 'expr_list') throw new Error('Not implemented')
      for (let i = 0; i < value.length; i++) {
        const schema = schemas[i]
        const val = value[i]
        validate(schema, val)
        if (ast.columns) {
          const columnName = ast.columns[i]
          row[columnName] = val.value
        } else {
          row.push(val.value)
        }
      }
      const block = await encode(row)
      yield block
      const _row = new Row({ block, table })
      cache.set(_row)
      inserts.push({ block, row: _row })
    }
  }
  const opts = { chunker, get, cache, ...mf }

  let rows
  let list
  let writeIndex
  let blocks = []
  if (table.rows !== null) {
    let i = await table.rows.getLength()
    list = inserts.map(({ block: { cid }, row, rowid }) => ({ key: rowid || i++, value: cid, row }))
    const { blocks: __blocks, root, previous } = await table.rows.bulk(list)
    rows = root
    yield * __blocks
    const prev = new Map(previous.map(({ key, value }) => [ key, value ]))
    list = await Promise.all(list.map(async ({ key, row, value }) => {
      let changes
      if (prev.get(key)) {
        changes = await row.rdiff(prev.get(key), get, cache)
      }
      return { key, row, value, changes }
    }))
    writeIndex = async (column, i) => {
      const entries = []
      for (const { key, row, changes } of list) {
        if (changes && typeof changes[column.name] !== 'undefined') {
          entries.push({ key: [ changes[column.name], key ], del: true })
        }
        const val = row.getIndex(i)
        entries.push({ key: [val, key], row, value: row.address })
      }
      const { blocks: _blocks, root } = await column.index.bulk(entries)
      _blocks.forEach(b => blocks.push(b))
      return root
    }
  } else {
    let i = 1
    list = inserts.map(({ block: { cid }, row, rowid }) => ({ key: rowid || i++, value: cid, row }))

    for await (const node of createSparseArray({ list, ...opts })) {
      yield node.block
      rows = node
    }
    writeIndex = async (column, i) => {
      const entries = []
      for (const { key, row } of list) {
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

  async getRow (cid, get, cache) {
    const create = block => new Row({ block, table: this })
    return getNode(cid, get, cache, create)
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

export { Table, Column, Row, Where, createTable }
