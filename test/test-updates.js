/* globals describe, it */
import IPSQL from '../src/index.js'
import { sql, Database } from '../src/database.js'
import { nocache } from 'chunky-trees/cache'
import { deepStrictEqual as same } from 'assert'
import { bf } from 'chunky-trees/utils'

const chunker = bf(3)

const cache = nocache

const { keys, entries } = Object

const storage = () => {
  const blocks = {}
  const put = block => {
    blocks[block.cid.toString()] = block
  }
  const get = async cid => {
    const block = blocks[cid.toString()]
    if (!block) console.log(cid)
    if (!block) throw new Error('Not found')
    return block
  }
  return { get, put, blocks }
}

const create = q => {
  const { get, put } = storage()
  return IPSQL.create(q, { get, put, chunker })
}

describe('updates', () => {
  it('insert twice', async () => {
    let ipsql = await create('CREATE TABLE Test (ID int, String varchar(255))')
    ipsql = await ipsql.write(`INSERT INTO Test VALUES ( 10, 'a' )`)
    ipsql = await ipsql.write(`INSERT INTO Test VALUES ( 11, 'a' )`)
    let all = await ipsql.read(`SELECT * FROM Test`)
    same(all, [ [ 10, 'a' ], [ 11, 'a' ] ])
    all = await ipsql.read(`SELECT * FROM Test WHERE ID = 10`)
    same(all, [ [ 10, 'a' ] ])
    all = await ipsql.read(`SELECT * FROM Test WHERE String = 'a'`)
    same(all, [ [ 10, 'a' ], [ 11, 'a' ] ])
  })
})
