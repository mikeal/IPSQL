import { CID } from 'multiformats'
import { Database } from './database.js'
import { nocache } from 'chunky-trees/cache'
import { bf } from 'chunky-trees/utils'
import { DAGAPI } from './dag.js'
import { immutable } from './utils.js'

const defaults = { cache: nocache, chunker: bf(256) }

const cache = new WeakMap()

const layerStorage = ({ get, put }) => {
  const getBlock = async cid => {
    let block = cache.get(cid)
    if (!block) block = await get(cid)
    cache.set(cid, block)
    return block
  }
  const putBlock = async block => {
    const ret = await put(block)
    cache.set(block.cid, block)
    return ret
  }
  return { getBlock, putBlock }
}

class IPSQL {
  constructor ({ cid, get, put, db, cache, chunker }) {
    /* If this is bound to a storage interface never overwrite its storage methods */
    if (this.get) get = this.get.bind(this)
    if (this.put) put = this.put.bind(this)
    if (!db) throw new Error('Missing required argument')
    const dt = new DAGAPI(this)
    const props = { cid, db, dt, get, put, ...layerStorage({ get, put }), cache, chunker }
    immutable(this, props)
  }

  cids () {
    return this.db.cids()
  }

  get id () {
    return this.cid.toString()
  }

  async write (q) {
    let iter
    if (typeof q === 'object') {
      if (q.dt) iter = this.dt.write(q.dt)
      else {
        throw new Error('Don\'t understand query')
      }
    } else {
      iter = this.db.sql(q, { chunker: this.db.chunker })
    }

    let last
    const promises = []
    for await (const block of iter) {
      promises.push(this.putBlock(block))
      last = block
    }
    await Promise.all(promises)
    return this.constructor.from(last.cid, { ...this })
  }

  async read (q, full) {
    const result = this.db.sql(q)
    const data = await result.all(full)
    if (full) {
      /* This should eventually be factored out to reduce export
       * size https://github.com/mikeal/IPSQL/issues/2
       */
      for (const table of Object.values(this.db.tables)) {
        data.cids.add(table)
        if (table.rows) data.cids.add(table.rows)
        for (const column of table.columns) {
          data.cids.add(column)
          if (column.index) data.cids.add(column.index)
        }
      }
      await data.cids.all()
    }
    return data
  }

  static create (q, { ...opts } = {}) {
    opts.cache = opts.cache || defaults.cache
    opts.chunker = opts.chunker || defaults.chunker
    const db = new this({ ...opts, db: Database.create(opts) })
    return db.write(q)
  }

  static async from (cid, { ...opts } = {}) {
    if (typeof cid === 'string') cid = CID.parse(cid)
    opts.cache = opts.cache || defaults.cache
    opts.chunker = opts.chunker || defaults.chunker
    const db = await Database.from(cid, opts)
    return new this({ ...opts, db, cid })
  }
}

export default IPSQL
