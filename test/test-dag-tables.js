/* globals describe, it */
import IPSQL from '../src/index.js'
import { bf } from 'chunky-trees/utils'
import { sha256 as hasher } from 'multiformats/hashes/sha2'
import { deepStrictEqual as same } from 'assert'
import cache from '../src/cache.js'

const chunker = bf(256)

const inmem = () => {
  const store = {}
  const get = async cid => {
    const key = cid.toString()
    if (!store[key]) throw new Error('Not found')
    return store[key]
  }
  const put = async block => {
    const key = block.cid.toString()
    store[key] = block
  }
  return { get, put }
}

const mkopts = () => {
  const store = inmem()
  return { ...store, store, cache: cache(), chunker, hasher }
}

const create = async (name, columns) => {
  const opts = mkopts()
  const query = { dt: { create: { name, columns } } }
  const ipsql = await IPSQL.create(query, opts)
  return ipsql
}

describe('dag tables', () => {
  it('create dag table', async () => {
    const opts = mkopts()
    const query = { dt: { create: { name: 'test', columns: 'firstname VARCHAR(255)' } } }
    const ipsql = await IPSQL.create(query, opts)
    same(ipsql.db.tables.test.name, 'test')
  })
  it('insert (no index match)', async () => {
    let ipsql = await create('test', 'firstname VARCHAR(255)')

    const hello = { hello: 'world' }
    ipsql = await ipsql.dt.insert('test', hello)
    const ret = await ipsql.dt.get('test', 1)
    same(ret, hello)
    same(ipsql.db.tables.test.name, 'test')

    const column = ipsql.db.tables.test.columns[0]
    same(column.index, null)
  })

  it('insert twice (no index match)', async () => {
    let ipsql = await create('test', 'firstname VARCHAR(255)')

    const hello = { hello: 'world' }

    ipsql = await ipsql.dt.insert('test', hello)
    let ret = await ipsql.dt.get('test', 1)
    same(ret, hello)
    same(ipsql.db.tables.test.name, 'test')

    let column = ipsql.db.tables.test.columns[0]
    same(column.index, null)

    ipsql = await ipsql.dt.insert('test', hello)
    ret = await ipsql.dt.get('test', 1)
    same(ret, hello)
    ret = await ipsql.dt.get('test', 2)
    same(ret, hello)
    same(ipsql.db.tables.test.name, 'test')

    column = ipsql.db.tables.test.columns[0]
    same(column.index, null)
  })

  it('insert (index match)', async () => {
    let ipsql = await create('test', 'firstname VARCHAR(255)')

    const hello = { firstname: 'hello', lastname: 'world' }
    ipsql = await ipsql.dt.insert('test', hello)
    const ret = await ipsql.dt.get('test', 1)
    same(ret, hello)
    same(ipsql.db.tables.test.name, 'test')

    const results = await ipsql.read('SELECT firstname FROM test WHERE firstname = "hello"')
    same(results, [['hello']])
  })

  it('insert twice (index match)', async () => {
    let ipsql = await create('test', 'firstname VARCHAR(255)')

    let hello = { firstname: 'hello', lastname: 'world' }
    ipsql = await ipsql.dt.insert('test', hello)
    const ret = await ipsql.dt.get('test', 1)
    same(ret, hello)
    same(ipsql.db.tables.test.name, 'test')

    let results = await ipsql.read('SELECT firstname FROM test WHERE firstname = "hello"')
    same(results, [['hello']])

    hello = { firstname: 'world', lastname: 'hello' }
    ipsql = await ipsql.dt.insert('test', hello)

    results = await ipsql.read('SELECT firstname FROM test WHERE firstname = "hello"')
    same(results, [['hello']])
    results = await ipsql.read('SELECT firstname FROM test WHERE firstname = "world"')
    same(results, [['world']])
  })
})
