/* globals describe, it */
import parse from '../src/sql.js'
import { deepStrictEqual as same } from 'assert'

class MockRow {
  constructor (data, columns) {
    this._data = data
    this._columns = columns
  }
}

class MockTable {
  constructor ({ database, name, rows, columns }) {
    this.database = database
    this.name = name
    this.rows = rows.map(r => new MockRow(r, columns))
    this.columns = columns
  }
  async query ({ where, cids }) {
    if (where === null) {
      return this.all(cids)
    }
    console.log(where)
    throw new Error('here')
  }
  async all (cids) {
    return [...this.rows]
  }
}

class MockDatabase {
  constructor (tables) {
    this.tables = {}
    for (const [ name, table ] of Object.entries(tables)) {
      this.tables[name] = new MockTable({ database: this, name, ...table })
    }
  }
  async table (name) {
    if (!this.tables[name]) throw new Error('No such table: ' + name)
    return this.tables[name]
  }
}

describe('sql', () => {
  const runner = ({ sql, database, context }) => parse(sql).run({ database }.then(result => {
    context = context || {}
    return result.run(context)
  })
  it('expression functions', async () => {
    const database = new MockDatabase({ Test: { rows: [[1], [2], [3]], columns: ['id'] } })
    let run = sql => runner({ sql, database })
    let csv = run('SELECT COUNT(ID) FROM Test')
    same(csv, [ 3 ])
    csv = run('SELECT SUM(ID) FROM Test')
    same(csv, [ 6 ])
    csv = run('SELECT AVG(ID) FROM Test')
    same(csv, [ 2 ])
    csv = run('SELECT MIN(ID) FROM Test')
    same(csv, [ 1 ])
    csv = run('SELECT MAX(ID) FROM Test')
    same(csv, [ 3 ])
  })
  it('sub selects', async () => {
    const s = parse(`
      SELECT C.one + C.two from (
        SELECT (SELECT COUNT(id) AS one FROM Test),
               (Select COUNT(id) AS two FROM Test2)
      )C`
    )
    const database = new MockDatabase()
    await s.run({ database })
  })
})
