/* globals describe, it */
import InMemory from '../src/stores/inmemory.js'
import S3 from '../src/stores/s3.js'
import { same } from './lib.js'
import MockS3 from './lib/mock-s3.js'

const stores = {
  s3: S3,
  inmem: InMemory
}

describe('updates', () => {
  for (const [name, Store] of Object.entries(stores)) {
    let create
    if (name === 's3') {
      create = q => Store.create(q, { s3: new MockS3() })
    } else {
      create = q => Store.create(q)
    }
    describe(name, () => {
      let cid
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
        cid = ipsql.db.block.cid
        same(!!(await ipsql.has(cid)), true)
      })
      it('not found', async () => {
        const s = await create('CREATE TABLE Test (ID int)')
        if (!cid) throw new Error('CID was not set')
        let threw = true
        try {
          await s.get(cid)
          threw = false
        } catch (e) {
          if (e.statusCode !== 404) throw e
        }
        same(threw, true)
        same(!(await s.has(cid)), true)
      })
      /*
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
      it('insert twice, missing column in second insert', async () => {
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
      it('update (int, varchar)', async () => {
        let ipsql = await create('CREATE TABLE Test (ID int, String varchar(255))')
        ipsql = await ipsql.write('INSERT INTO Test VALUES ( 10, \'a\' )')
        ipsql = await ipsql.write('UPDATE Test SET String = \'b\'')
        let all = await ipsql.read('SELECT * FROM Test')
        same(all, [[10, 'b']])
        all = await ipsql.read('SELECT * FROM Test WHERE ID = 10')
        same(all, [[10, 'b']])
        all = await ipsql.read('SELECT * FROM Test WHERE String = \'a\'')
        same(all, [])
        all = await ipsql.read('SELECT * FROM Test WHERE String = \'b\'')
        same(all, [[10, 'b']])
      })
      it('update (int, float, varchar)', async () => {
        let ipsql = await create('CREATE TABLE Test (Int int, Float float, String varchar(255))')
        ipsql = await ipsql.write('INSERT INTO Test VALUES ( 10, 1.1, \'a\' )')

        ipsql = await ipsql.write('UPDATE Test SET String = \'b\'')
        let all = await ipsql.read('SELECT * FROM Test')
        same(all, [[10, 1.1, 'b']])
        all = await ipsql.read('SELECT * FROM Test WHERE Int = 10')
        same(all, [[10, 1.1, 'b']])
        all = await ipsql.read('SELECT * FROM Test WHERE String = \'a\'')
        same(all, [])
        all = await ipsql.read('SELECT * FROM Test WHERE String = \'b\'')
        same(all, [[10, 1.1, 'b']])

        ipsql = await ipsql.write('UPDATE Test SET Int = 11')
        all = await ipsql.read('SELECT * FROM Test')
        same(all, [[11, 1.1, 'b']])
        all = await ipsql.read('SELECT * FROM Test WHERE Int = 11')
        same(all, [[11, 1.1, 'b']])
        all = await ipsql.read('SELECT * FROM Test WHERE Int = 10')
        same(all, [])
        all = await ipsql.read('SELECT * FROM Test WHERE String = \'b\'')
        same(all, [[11, 1.1, 'b']])

        ipsql = await ipsql.write('UPDATE Test SET Float = 1.2')
        all = await ipsql.read('SELECT * FROM Test')
        same(all, [[11, 1.2, 'b']])
        all = await ipsql.read('SELECT * FROM Test WHERE Float = 1.2')
        same(all, [[11, 1.2, 'b']])
        all = await ipsql.read('SELECT * FROM Test WHERE Float = 1.1')
        same(all, [])
        all = await ipsql.read('SELECT * FROM Test WHERE String = \'b\'')
        same(all, [[11, 1.2, 'b']])
      })
      it('update WHERE', async () => {
        let ipsql = await create('CREATE TABLE Test (ID int, String varchar(255))')
        let expected = [[10, 'a'], [11, 'b'], [12, 'a']]
        const values = expected.map(([i, s]) => `(${i}, "${s}")`)
        ipsql = await ipsql.write(`INSERT INTO Test VALUES ${values.join(', ')}`)
        let all = await ipsql.read('SELECT * FROM Test')
        same(all, expected)
        ipsql = await ipsql.write('UPDATE Test SET ID = 11 WHERE String = \'a\'')
        expected = expected.map(([i, s]) => [s === 'a' ? 11 : i, s])
        all = await ipsql.read('SELECT * FROM Test')
        same(all, expected)

        all = await ipsql.read('SELECT * FROM Test WHERE String = \'a\'')
        same(all, [[11, 'a'], [11, 'a']])

        all = await ipsql.read('SELECT * FROM Test WHERE String = \'b\'')
        same(all, [[11, 'b']])

        all = await ipsql.read('SELECT * FROM Test WHERE ID = 10')
        same(all, [])

        all = await ipsql.read('SELECT * FROM Test WHERE ID = 11')
        same(all, expected)
      })
      */
    })
  }
})
