import { CID } from 'multiformats'
import { Database } from './database.js'
import { nocache } from 'chunky-trees/cache'
import { bf } from 'chunky-trees/utils'

const immutable = (obj, props) => {
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(obj, key, { value, writable: false, enumerable: true })
  }
}

const defaults = { cache: nocache, chunker: bf(256) }

class IPSQL {
  constructor ({ cid, get, put, db }) {
    if (!get || !put || !db) throw new Error('Missing required argument')
    const props = { cid, db, getBlock: get, putBlock: put }
    immutable(this, props)
  }

  get id () {
    return this.cid.toString()
  }

  async write (q) {
    const iter = this.db.sql(q, { chunker: this.db.chunker })

    let last
    for await (const block of iter) {
      await this.putBlock(block)
      last = block
    }
    const { getBlock: get, putBlock: put } = this
    const opts = { get, cache: this.db.cache, chunker: this.db.chunker }
    const db = await Database.from(last.cid, opts)
    return new IPSQL({ get, put, db, cid: last.cid })
  }

  async read (q, full) {
    const result = this.db.sql(q)
    const data = await result.all(full)
    return data
  }

  static create (q, opts) {
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
