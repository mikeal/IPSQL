/* globals describe, it */
import { create, same } from './lib.js'

describe('updates', () => {
  it('insert twice', async () => {
    let ipsql = await create('CREATE TABLE Test (ID int, String varchar(255))')
    ipsql = await ipsql.write('INSERT INTO Test VALUES ( 10, \'a\' )')
    ipsql = await ipsql.write('INSERT INTO Test VALUES ( 11, \'a\' )')
    let all = await ipsql.read('SELECT * FROM Test')
    same(all, [[10, 'a'], [11, 'a']])
    all = await ipsql.read('SELECT * FROM Test WHERE ID = 10')
    same(all, [[10, 'a']])
    all = await ipsql.read('SELECT * FROM Test WHERE String = \'a\'')
    same(all, [[10, 'a'], [11, 'a']])
  })
  it('insert twice, missing column in first insert', async () => {
    let ipsql = await create('CREATE TABLE Test (ID int, String varchar(255))')
    ipsql = await ipsql.write('INSERT INTO Test (ID) VALUES ( 10 )')
    ipsql = await ipsql.write('INSERT INTO Test VALUES ( 11, \'a\' )')
    let all = await ipsql.read('SELECT * FROM Test')
    same(all, [[10, undefined], [11, 'a']])
    all = await ipsql.read('SELECT * FROM Test WHERE ID = 10')
    same(all, [[10, undefined]])
    all = await ipsql.read('SELECT * FROM Test WHERE String = \'a\'')
    same(all, [[11, 'a']])
  })
  it('insert twice, missing column in first insert', async () => {
    let ipsql = await create('CREATE TABLE Test (ID int, String varchar(255))')
    ipsql = await ipsql.write('INSERT INTO Test VALUES ( 11, \'a\' )')
    ipsql = await ipsql.write('INSERT INTO Test (ID) VALUES ( 10 )')
    let all = await ipsql.read('SELECT * FROM Test')
    same(all, [[11, 'a'], [10, undefined]])
    all = await ipsql.read('SELECT * FROM Test WHERE ID = 10')
    same(all, [[10, undefined]])
    all = await ipsql.read('SELECT * FROM Test WHERE String = \'a\'')
    same(all, [[11, 'a']])
  })
})
