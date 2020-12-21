/* globals describe, it */
import { create, same } from './lib.js'

describe('updates', () => {
  it('select COUNT, SUM, AVG, MIN, MAX', async () => {
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
})
