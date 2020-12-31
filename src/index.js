import { CID } from 'multiformats'
import { Database } from './database.js'
import { nocache } from 'chunky-trees/cache'
import { createBlock } from './utils.js'
import { bf } from 'chunky-trees/utils'
import ipfsStore from './ipfs.js'

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

  async read (q) {
    const result = this.db.sql(q)
    const all = await result.all()
    return all
  }

  static create (q, opts) {
    opts.cache = opts.cache || defaults.cache
    opts.chunker = opts.chunker || defaults.chunker
    if (opts.ipfs) {
      const store = ipfsStore(opts.ipfs)
      opts.get = store.get
      opts.put = store.put
    }
    const db = new IPSQL({ ...opts, db: Database.create(opts) })
    return db.write(q)
  }

  static async from (cid, { ipfs, get, put, cache, chunker }) {
    if (typeof cid === 'string') cid = CID.parse(cid)
    let store
    if (ipfs) {
      const store = ipfsStore(ipfs)
      get = store.get
      put = store.put
    }
    const opts = { get, cache: cache || defaults.cache, chunker: chunker || defaults.chunker }
    const db = await Database.from(cid, opts)
    return new IPSQL({ ...opts, put, db, cid })
  }
}

export default IPSQL
