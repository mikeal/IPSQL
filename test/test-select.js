/* globals describe, it */
import { create, same } from './lib.js'

describe('select', () => {
  it('COUNT, SUM, AVG, MIN, MAX', async () => {
    let ipsql = await create('CREATE TABLE Test (ID int, String varchar(255))')
    const expected = [[10, 'a'], [11, 'b'], [12, 'a']]
    const values = expected.map(([i, s]) => `(${i}, "${s}")`)
    ipsql = await ipsql.write(`INSERT INTO Test VALUES ${values.join(', ')}`)
    let all = await ipsql.read('SELECT * FROM Test')
    same(all, expected)
    all = await ipsql.read('SELECT COUNT(ID) FROM Test')
    same(all, 3)

    all = await ipsql.read('SELECT SUM(ID) FROM Test')
    same(all, 33)

    all = await ipsql.read('SELECT AVG(ID) FROM Test')
    same(all, 11)

    all = await ipsql.read('SELECT MIN(ID) FROM Test')
    same(all, 10)

    all = await ipsql.read('SELECT MAX(ID) FROM Test')
    same(all, 12)
  })
  it('FROM two tables', async () => {
    let ipsql = await create('CREATE TABLE Test (id int)')
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    ipsql = await ipsql.write(`INSERT INTO Test VALUES ${values.map(s => '(' + s + ')').join(', ')}`)
    ipsql = await ipsql.write('CREATE TABLE Test2 (id int)')
    ipsql = await ipsql.write(`INSERT INTO Test2 VALUES ${values.map(s => '(' + s + ')').join(', ')}`)

    const all = await ipsql.read('SELECT * from Test, Test2')
    same(all.length, 20)
    same(all.reduce((x, [y]) => x + y, 0), 110)
  })
  it('FROM sub-select', async () => {
    let ipsql = await create('CREATE TABLE Test (id int)')
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    ipsql = await ipsql.write(`INSERT INTO Test VALUES ${values.map(s => '(' + s + ')').join(', ')}`)

    let all = await ipsql.read('SELECT id from Test WHERE id = 1')
    same(all, [[1]])

    all = await ipsql.read('SELECT C from ( SELECT COUNT(id) FROM Test)C')
    same(all, [[10]])
  })

  it('FROM sub-select', async () => {
    let ipsql = await create('CREATE TABLE Test (id int)')
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    ipsql = await ipsql.write(`INSERT INTO Test VALUES ${values.map(s => '(' + s + ')').join(', ')}`)

    let all = await ipsql.read('SELECT id from Test WHERE id = 1')
    same(all, [[1]])

    all = await ipsql.read('SELECT C + 2 from ( SELECT COUNT(id) + 2 FROM Test )C')
    same(all, 14)
  })
})
