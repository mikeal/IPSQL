import { CID } from 'multiformats'
import { Database } from './database.js'
import { nocache } from 'chunky-trees/cache'
import { bf } from 'chunky-trees/utils'
import { DAGAPI } from './dag.js'

const immutable = (obj, props) => {
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(obj, key, { value, writable: false, enumerable: true })
  }
}

const defaults = { cache: nocache, chunker: bf(256) }

class IPSQL {
  constructor ({ cid, get, put, db }) {
    if (!get || !put || !db) throw new Error('Missing required argument')
    const dt = new DAGAPI(this)
    const props = { cid, db, getBlock: get, putBlock: put, dt }
    immutable(this, props)
  }

  get IPSQL () {
    return IPSQL
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
    for await (const block of iter) {
      await this.putBlock(block)
      last = block
    }
    const { getBlock: get, putBlock: put } = this
    const opts = { get, put, cache: this.db.cache, chunker: this.db.chunker }
    return IPSQL.from(last.cid, opts)
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

  static create (q, opts = {}) {
    opts.cache = opts.cache || defaults.cache
    opts.chunker = opts.chunker || defaults.chunker
    const db = new IPSQL({ ...opts, db: Database.create(opts) })
    return db.write(q)
  }

  static async from (cid, { get, put, cache, chunker }) {
    if (typeof cid === 'string') cid = CID.parse(cid)
    const opts = { get, cache: cache || defaults.cache, chunker: chunker || defaults.chunker }
    const db = await Database.from(cid, opts)
    return new IPSQL({ ...opts, put, db, cid })
  }
}

export default IPSQL
