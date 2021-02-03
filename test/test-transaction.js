/* globals describe, it */
import IPSQL from '../src/stores/inmemory.js'
import { encode } from '../src/utils.js'
import { deepStrictEqual as same } from 'assert'

const create = async sql => {
  const ipsql = new IPSQL({ cid: 'headless', cache: IPSQL.defaults.cache })
  return { ipsql, trans: await ipsql.transaction({ sql, db: null }) }
}

describe('transactions', () => {
  it('create w/ block', async () => {
    const ipsql = new IPSQL({ cid: 'headless', cache: IPSQL.defaults.cache })
    const sql = 'CREATE TABLE test (id int)'
    const block = await encode({ sql, db: null })
    const proof = await ipsql.transaction(block)
    same(Object.keys(proof.value), ['input', 'db', 'writes'])
  })
  it('create table', async () => {
    const { trans, ipsql } = await create(`
      CREATE TABLE test ( id int, name varchar(255) )
    `)
    same(!!trans.value.db, true)
    const test = await IPSQL.from(trans.value.db, ipsql)
    const db = await test.db
    same(Object.keys(db.tables), ['test'])
  })
  it('basic insert & select', async () => {
    let { trans, ipsql } = await create(`
      CREATE TABLE test ( id int, name varchar(255) )
    `)
    same(!!trans.value.db, true)
    trans = await ipsql.transaction({
      sql: 'INSERT INTO test VALUES (5, "test")',
      db: trans.value.db
    })
    ipsql = await IPSQL.from(trans.value.db, ipsql)
    let res = await ipsql.read('SELECT * from test')
    same([[5, 'test']], res)

    trans = await ipsql.transaction('SELECT * from test')
    res = await ipsql.getBlock(trans.value.result)
    same([[5, 'test']], res.value)
  })
})
