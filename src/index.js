import { CID } from 'multiformats'
import { Database } from './database.js'
import { nocache } from 'chunky-trees/cache'
import { DAGAPI } from './dag.js'
import { immutable, encode } from './utils.js'

const defaults = { cache: nocache }
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

const limiter = (concurrency = 100) => {
  const promises = new Set()
  const limit = async (p) => {
    p.then(() => promises.delete(p))
    promises.add(p)
    while (promises.size > concurrency) {
      await Promise.race([...promises])
    }
  }
  limit.flush = async () => {
    while (promises.size) {
      await Promise.all([...promises])
    }
  }
  return limit
}

class IPSQL {
  constructor ({ cid, get, put, cache }) {
    if (!cache) throw new Error('missing cache')
    /* If this is bound to a storage interface never overwrite its storage methods */
    if (this.get) get = this.get.bind(this)
    if (this.put) put = this.put.bind(this)
    if (!cid) throw new Error('Missing required argument')
    const dt = new DAGAPI(this)
    const props = { cid, dt, get, put, ...layerStorage({ get, put }), cache }
    if (cid !== 'headless') {
      props.db = Database.from(cid, { ...props, get: props.getBlock, put: props.putBlock })
    }
    immutable(this, props)
  }

  cids () {
    return this.db.cids()
  }

  get id () {
    return this.cid.toString()
  }

  async write (q) {
    const db = await this.db
    let iter
    if (typeof q === 'object') {
      if (q.dt) iter = this.dt.write(q.dt)
      else {
        throw new Error('Don\'t understand query')
      }
    } else {
      iter = db.sql(q)
    }

    let last
    const limit = limiter()
    for await (const block of iter) {
      await limit(this.putBlock(block))
      last = block
    }
    await limit.flush()
    return this.constructor.from(last.cid, { ...this })
  }

  async read (q, full) {
    const db = await this.db
    const result = db.sql(q)
    const data = await result.all(full)
    if (full) {
      /* This should eventually be factored out to reduce export
       * size https://github.com/mikeal/IPSQL/issues/2
       */
      for (const table of Object.values(db.tables)) {
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

  async transaction (trans) {
    // get the transaction into a block
    if (trans.asCID === trans) {
      trans = await this.getBlock(trans)
    }
    if (trans.asBlock !== trans) {
      if (typeof trans === 'string') {
        trans = { sql: trans, db: this.cid ? this.cid : null }
      }
      trans = await encode(trans)
      await this.putBlock(trans)
    }
    const { sql, db: cid } = trans.value

    let db
    if (cid) {
      if (cid.equals(this.cid)) db = await this.db
      else db = await Database.from(cid, { ...this, get: this.getBlock, put: this.putBlock })
    } else if (cid === null) {
      db = await Database.create({ ...this, get: this.getBlock, put: this.putBlock })
    } else {
      throw new Error('Invalid CID in transaction input')
    }
    const results = await db.sql(sql)
    /* right now this code splits from reads vs writes which won't work for all
     * sql statements since there are statements that both read and write.
     * this will all get normalized in a future refactor of the sql engine.
     */
    if (results.all) {
      // read-only
      const data = await results.all(true)
      for (const table of Object.values(db.tables)) {
        data.cids.add(table)
        if (table.rows) data.cids.add(table.rows)
        for (const column of table.columns) {
          data.cids.add(column)
          if (column.index) data.cids.add(column.index)
        }
      }
      const reads = [...await data.cids.all()].map(str => CID.parse(str))
      const result = await encode(data.result)
      await this.putBlock(result)
      const block = await encode({ result: result.cid, reads, writes: [result.cid] })
      return block
    } else {
      // writer
      let last
      const limit = limiter()
      const writes = new Map()
      for await (const block of results) {
        await limit(this.putBlock(block))
        writes.set(block.cid.toString(), block.cid)
        last = block
      }
      await limit.flush()
      const db = last.cid
      const writesBlock = await encode([...writes.values()])
      const block = await encode({ input: trans.cid, db, writes: writesBlock.cid })
      await this.putBlock(block)
      return block
    }
  }

  static create (q, { ...opts } = {}) {
    opts.cache = opts.cache || defaults.cache
    const db = new this({ ...opts, cid: 'headless' })
    db.db = Database.create({ ...db })
    return db.write(q)
  }

  static async from (cid, { ...opts } = {}) {
    if (typeof cid === 'string') cid = CID.parse(cid)
    opts.cache = opts.cache || defaults.cache
    const db = new this({ ...opts, cid })
    await db.db
    return db
  }
}

IPSQL.defaults = defaults

export default IPSQL
