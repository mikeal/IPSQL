/* globals describe, it */
import { Database } from '../src/database.js'
import { nocache } from 'chunky-trees/cache'
import { bf } from 'chunky-trees/utils'
import { SparseArrayLeaf } from 'chunky-trees/sparse-array'
import { DBIndexLeaf, DBIndexBranch } from 'chunky-trees/db-index'
import InMemory from '../src/stores/inmemory.js'

import { create, same } from './lib.js'

const storage = () => {
  const store = new InMemory({ db: true })
  const get = store.get.bind(store)
  const put = store.put.bind(store)
  return { store, get, put }
}

const chunker = bf(3)

const cache = nocache

const { entries } = Object

const createPersons = `CREATE TABLE Persons (
  PersonID int,
  LastName varchar(255),
  FirstName varchar(255),
  Address varchar(255),
  City varchar(255)
)`

const createPersons2 = `CREATE TABLE Persons2 (
  PersonID int,
  LastName varchar(255),
  FirstName varchar(255),
  Address varchar(255),
  City varchar(255)
)`

// const insertOnlyId = 'INSERT INTO Persons (PersonID) VALUES (4006)'
const insertFullRow = 'INSERT INTO Persons VALUES (12, \'Rogers\', \'Mikeal\', \'241 BVA\', \'San Francisco\')'
const insertTwoRows = insertFullRow + ', (13, \'Rogers\', \'NotMikeal\', \'241 AVB\', \'San Francisco\')'

const runSQL = async (q, database = Database.create(), store = storage()) => {
  const iter = database.sql(q, { chunker })

  let last
  for await (const block of iter) {
    await store.put(block)
    last = block
  }
  const opts = { get: store.get, cache, chunker }
  const db = await Database.from(last.cid, opts)
  return { database: db, store, cache, root: last.cid }
}

const verifyPersonTable = table => {
  const expected = [
    {
      name: 'PersonID',
      dataType: 'INT'
    },
    {
      name: 'LastName',
      dataType: 'VARCHAR',
      length: 255
    },
    {
      name: 'FirstName',
      dataType: 'VARCHAR',
      length: 255
    },
    {
      name: 'Address',
      dataType: 'VARCHAR',
      length: 255
    },
    {
      name: 'City',
      dataType: 'VARCHAR',
      length: 255
    }
  ]
  for (const column of table.columns) {
    const { name, dataType, length } = expected.shift()
    same(column.name, name)
    same(column.schema.definition.dataType, dataType)
    same(column.schema.definition.length, length)
  }
}

describe('basics', () => {
  it('basic create', async () => {
    const { database: db } = await runSQL(createPersons)
    same(entries(db.tables).length, 1)
    same(db.tables.Persons.rows, null)
    verifyPersonTable(db.tables.Persons)
  })

  it('create twice', async () => {
    const { database, store } = await runSQL(createPersons)
    const db = (await runSQL(createPersons2, database, store)).database
    same(entries(db.tables).length, 2)
    same(db.tables.Persons2.rows, null)
    verifyPersonTable(db.tables.Persons)
    verifyPersonTable(db.tables.Persons2)
  })

  it('insert initial row', async () => {
    const { database, store } = await runSQL(createPersons)
    const { database: db } = await runSQL(insertFullRow, database, store)
    const table = db.tables.Persons
    same(table.rows instanceof SparseArrayLeaf, true)
    for (const column of table.columns) {
      same(column.index instanceof DBIndexLeaf, true)
    }
  })

  const onlyFirstRow = [[12, 'Rogers', 'Mikeal', '241 BVA', 'San Francisco']]
  const onlySecondRow = [[13, 'Rogers', 'NotMikeal', '241 AVB', 'San Francisco']]

  it('select all columns', async () => {
    let ipsql = await create(createPersons)
    ipsql = await ipsql.write(insertFullRow)
    const all = await ipsql.read('SELECT * FROM Persons')
    same(all, onlyFirstRow)
  })

  const twoRowExpected = [
    onlyFirstRow[0],
    onlySecondRow[0]
  ]

  it('insert two rows and select', async () => {
    const { database, store } = await runSQL(createPersons)
    const { database: db } = await runSQL(insertTwoRows, database, store)
    const table = db.tables.Persons
    same(table.rows instanceof SparseArrayLeaf, true)
    for (const column of table.columns) {
      same(column.index instanceof DBIndexLeaf || column.index instanceof DBIndexBranch, true)
    }
    const result = db.sql('SELECT * FROM Persons')
    const all = await result.all()
    same(all, twoRowExpected)
  })

  it('select two columns', async () => {
    let ipsql = await create(createPersons)
    ipsql = await ipsql.write(insertFullRow)
    const all = await ipsql.read('SELECT FirstName, LastName FROM Persons')
    same(all, [['Mikeal', 'Rogers']])
  })

  it('select * where (string comparison)', async () => {
    let ipsql = await create(createPersons)
    ipsql = await ipsql.write(insertTwoRows)
    let all = await ipsql.read('SELECT * FROM Persons WHERE FirstName="Mikeal"')
    same(all, onlyFirstRow)
    all = await ipsql.read('SELECT * FROM Persons WHERE FirstName="NotMikeal"')
    same(all, onlySecondRow)
  })

  it('select * where (string comparison AND)', async () => {
    let ipsql = await create(createPersons)
    ipsql = await ipsql.write(insertTwoRows)
    let all = await ipsql.read('SELECT * FROM Persons WHERE FirstName="Mikeal" AND LastName="Rogers"')
    same(all, onlyFirstRow)
    all = await ipsql.read('SELECT * FROM Persons WHERE FirstName="NotMikeal" AND LastName="Rogers"')
    same(all, onlySecondRow)
    all = await ipsql.read('SELECT * FROM Persons WHERE FirstName="Mikeal" AND LastName="NotRogers"')
    same(all, [])
    all = await ipsql.read('SELECT * FROM Persons WHERE FirstName="NotMikeal" AND LastName="NotRogers"')
    same(all, [])
  })

  it('select * where (string comparison OR)', async () => {
    let ipsql = await create(createPersons)
    ipsql = await ipsql.write(insertTwoRows)
    let all = await ipsql.read('SELECT * FROM Persons WHERE FirstName="Mikeal" OR LastName="NotRogers"')
    same(all, onlyFirstRow)
    all = await ipsql.read('SELECT * FROM Persons WHERE FirstName="NotMikeal" OR LastName="NotRogers"')
    same(all, onlySecondRow)
    all = await ipsql.read('SELECT * FROM Persons WHERE FirstName="XMikeal" OR LastName="XRogers"')
    same(all, [])
  })

  it('select * where (string comparison AND 3x)', async () => {
    let ipsql = await create(createPersons)
    ipsql = await ipsql.write(insertTwoRows)
    const pre = 'SELECT * FROM Persons WHERE '
    let all = await ipsql.read(pre + 'FirstName="Mikeal" AND LastName="Rogers" AND City="San Francisco"')
    same(all, onlyFirstRow)
    all = await ipsql.read(pre + 'FirstName="NotMikeal" AND LastName="Rogers" AND City="San Francisco"')
    same(all, onlySecondRow)
    all = await ipsql.read(pre + 'FirstName="XMikeal" OR LastName="XRogers"')
    same(all, [])
  })

  it('select * where (string comparison OR 3x)', async () => {
    let ipsql = await create(createPersons)
    ipsql = await ipsql.write(insertTwoRows)
    const pre = 'SELECT * FROM Persons WHERE '
    let all = await ipsql.read(pre + 'FirstName="X" OR LastName="X" OR City="San Francisco"')
    same(all, twoRowExpected)
    all = await ipsql.read(pre + 'FirstName="X" OR LastName="X" OR City="San Francisco"')
    same(all, twoRowExpected)
    all = await ipsql.read(pre + 'FirstName="XMikeal" OR LastName="XRogers" OR City="X"')
    same(all, [])
  })

  it('select * where (int ranges)', async () => {
    let ipsql = await create('CREATE TABLE Test ( ID int )')
    const values = [...Array(10).keys()].map(k => `(${k})`).join(', ')
    ipsql = await ipsql.write(`INSERT INTO Test VALUES ${values}`)
    const pre = 'SELECT * FROM Test WHERE '
    let all = await ipsql.read(pre + 'ID > 1 AND ID < 3')
    same(all, [[2]])
    all = await ipsql.read(pre + 'ID >= 2 AND ID <= 3')
    same(all, [[2], [3]])
  })

  it('select * where (string ranges)', async () => {
    let ipsql = await create('CREATE TABLE Test ( Name varchar(255) )')
    const values = ['a', 'b', 'c', 'd', 'e', 'f'].map(k => `("${k}")`).join(', ')
    const inserts = `INSERT INTO Test VALUES ${values}`
    ipsql = await ipsql.write(inserts)
    const pre = 'SELECT * FROM Test WHERE '
    let all = await ipsql.read(pre + 'Name > "a" AND Name < "c"')
    same(all, [['b']])
    all = await ipsql.read(pre + 'Name >= "b" AND Name <= "d"')
    same(all, [['b'], ['c'], ['d']])
  })

  it('select * where (int range operators)', async () => {
    let ipsql = await create('CREATE TABLE Test ( ID int )')
    const values = [...Array(10).keys()].map(k => `(${k})`).join(', ')
    const inserts = `INSERT INTO Test VALUES ${values}`
    ipsql = await ipsql.write(inserts)
    const pre = 'SELECT * FROM Test WHERE '
    let all = await ipsql.read(pre + 'ID < 3')
    same(all, [[0], [1], [2]])
    all = await ipsql.read(pre + 'ID > 8')
    same(all, [[9]])
    all = await ipsql.read(pre + 'ID <= 2')
    same(all, [[0], [1], [2]])
    all = await ipsql.read(pre + 'ID >= 9')
    same(all, [[9]])
  })

  it('select * where (string range operators)', async () => {
    const create = 'CREATE TABLE Test ( Name varchar(255) )'
    const { database, store } = await runSQL(create)
    const values = ['a', 'b', 'c', 'd', 'e', 'f'].map(k => `("${k}")`).join(', ')
    const inserts = `INSERT INTO Test VALUES ${values}`
    const { database: db } = await runSQL(inserts, database, store)
    const pre = 'SELECT * FROM Test WHERE '
    let result = db.sql(pre + 'Name > "e"')
    let all = await result.all()
    same(all, [['f']])
    result = db.sql(pre + 'Name >= "e"')
    all = await result.all()
    same(all, [['e'], ['f']])
    result = db.sql(pre + 'Name < "b"')
    all = await result.all()
    same(all, [['a']])
    result = db.sql(pre + 'Name <= "b"')
    all = await result.all()
    same(all, [['a'], ['b']])
  })

  it('select * where (ORDER BY int)', async () => {
    let ipsql = await create('CREATE TABLE Test ( Name varchar(255), Id int )')
    let i = 0
    const values = ['a', 'b', 'c', 'd', 'e', 'f'].reverse().map(k => `("${k}", ${i++})`).join(', ')
    const inserts = `INSERT INTO Test VALUES ${values}`
    ipsql = await ipsql.write(inserts)
    const pre = 'SELECT * FROM Test WHERE '
    const query = pre + 'Name > "a" AND Name < "f" ORDER BY Id'
    let all = await ipsql.read(query)
    const expected = [['e', 1], ['d', 2], ['c', 3], ['b', 4]]
    same(all, expected)
    all = await ipsql.read(query + ' DESC')
    same(all, expected.reverse())
  })

  it('select * where (ORDER BY string)', async () => {
    let ipsql = await create('CREATE TABLE Test ( Name varchar(255), Id int )')
    let i = 0
    const values = ['a', 'b', 'c', 'd', 'e', 'f'].reverse().map(k => `("${k}", ${i++})`).join(', ')
    const inserts = `INSERT INTO Test VALUES ${values}`
    ipsql = await ipsql.write(inserts)
    const pre = 'SELECT * FROM Test WHERE '
    const query = pre + 'Id > 1 AND Id < 5 ORDER BY Name'
    let all = await ipsql.read(query)
    const expected = [['b', 4], ['c', 3], ['d', 2]]
    same(all, expected)
    all = await ipsql.read(query + ' DESC')
    same(all, expected.reverse())
  })
})
