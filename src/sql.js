import sql from 'node-sql-parser'
import { immutable } from './utils.js'

const _parse = query => (new sql.Parser()).astify(query)

const verbs = {}
const construct = (opts, key) => {
  const { syntax } = opts
  if (syntax === null ||
      typeof syntax === 'number' ||
      typeof syntax === 'boolean' ) {
    if (key && !verbs[key]) console.error('missing: ' + key)
    return syntax
  }
  const k = syntax.type ? syntax.type : key
  if (!k) throw new Error('No key')
  if (!verbs[k]) return console.error('missing: ' + k)
  if (Array.isArray(syntax)) {
    return syntax.map(syntax => construct({ syntax }, key))
  }
  return new verbs[k](opts)
}

class SQL {
  constructor ({syntax, parent}) {
    const props = { syntax, parent }
    if (!syntax || typeof syntax !== 'object') return immutable(this, props)
    if (Array.isArray(syntax)) {
      props.array = syntax.map(syntax => construct({ syntax, parent: this }, '_'))
    } else {
      for (const [ key, _syntax ] of Object.entries(syntax)) {
        props[key] = construct({ syntax: _syntax, parent: this }, key)
      }
    }
    immutable(this, props)
  }
  async run ({ database }) {
    throw new Error('Not Implemented: ' + this.constructor.name)
  }
}
verbs._ = SQL

const concatResults = results => {
  throw new Error('Not implemented, select concatenation')
}

verbs.select = class Select extends SQL {
  async run ({ database }) {
    const promises = []
    if (this.from) {
      if (!Array.isArray(this.from)) throw new Error('Missing FROM')
      for (const obj of this.from) {
        promises.push(obj.run({ database, select: this, columns: this.columns, where: this.where }))
      }
    } else {
      if (!this.columns) throw new Error('Not implemented, select without columns or from')
      for (const column of this.columns) {
        if (!column.expr) throw new Error('Not implemented, non-expr column-only')
        promises.push(column.expr.run({ database }))
      }
    }
    const results = await Promise.all(promises)
    if (results.length === 1) return results[0]
    return concatResults(results)
  }
}

class Result {
  constructor (opts) {
    immutable(this, opts)
  }
  async run (context) {
    const lines = []
    for (const column of this.columns) {
      if (column.expr) {
        const result = await column.expr.run({ rows: this.rows })
        if (column.expr.as) {
          console.log(column.expr.as)
          throw new Error('Not Implemented')
        }
        lines.push(result)
      } else {
        throw new Error('Not implemented')
      }
    }
    return lines
  }
}

verbs.from = class From extends SQL {
  async run ({ database, select, columns, where }) {
    let rows
    if (this.table) {
      const { table } = await this.table.run({ database })
      rows = await table.query({ from: this, columns, where })
    } else if (this.expr) {
      throw new Error('here, normalize return value for rows')
      rows = await this.expr.run({ database, select, from: this })
    } else {
      throw new Error('Not implemented, run without table or expr')
    }
    return new Result({ rows, columns, select })
  }
}

verbs.table = class Table extends SQL {
  async run ({ database }) {
    const name = this.syntax
    if (!name) throw new Error('Not implemented, table with no name')
    const table = await database.table(name)
    return { table }
  }
}

verbs.expr = class Expr extends SQL {
  async run ({ database }) {
    if (this.ast) return this.ast.run({ database })
    throw new Error('Not Implemented')
  }
}

verbs.aggr_func = class AggregatorFunction extends SQL {
  async run ({ rows }) {
    const name = this.name.syntax
    if (name === 'COUNT') {
      return rows.length
    }
    throw new Error('Not Implemented: Aggregator function ' + name)
  }
}

verbs.columns = class Columns extends SQL {}
verbs.binary_expr = class BinaryExpression extends SQL {}
verbs.column_ref = class ColumnRef extends SQL {}
verbs.where = class Where extends SQL {}
verbs.with = class With extends SQL {}
verbs.type = class Type extends SQL {}
verbs.options = class Options extends SQL {}
verbs.distinct = class Distinct extends SQL {}
verbs.operator = class Operator extends SQL {}
verbs.left = class Left extends SQL {}
verbs.right = class Right extends SQL {}
verbs.ast = class AST extends SQL {}
verbs.as = class As extends SQL {}
verbs.groupby = class GroupBy extends SQL {}
verbs.having = class Having extends SQL {}
verbs.orderby = class OrderBy extends SQL {}
verbs.limit = class Limit extends SQL {}
verbs.for_update = class ForUpdate extends SQL {}
verbs.column = class Column extends SQL {}
verbs.tableList = class TableList extends SQL {}
verbs.columnList = class ColumnList extends SQL {}
verbs.name = class ColumnList extends SQL {}
verbs.args = class Args extends SQL {}
verbs.over = class Over extends SQL {}
verbs.parentheses = class Parentheses extends SQL {}
verbs.db = class DB extends SQL {}

const parse = str => construct({ syntax: _parse(str) })
export default parse
