import { CID } from 'multiformats'
import { Database } from './database.js'
import { nocache } from 'chunky-trees/cache'
import { bf, createBlock } from './utils.js'

const immutable = (obj, props) => {
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(obj, key, { value, writable: false, enumerable: true })
  }
}

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
    const iter = this.db.sql(q, { chunker: this.chunker })

    let last
    for await (const block of iter) {
      await this.putBlock(block)
      last = block
    }
    const opts = { get: this.getBlock, cache: this.db.cache, chunker: this.db.chunker }
    const db = await Database.from(last.cid, opts)
    return new IPSQL({ ...this, db, root: last.cid })
  }

  async read (q) {
    const result = this.db.sql(q)
    const all = await result.all()
    return all
  }

  static create (opts) {
    return new IPSQL({ ...opts, db: Database.create() })
  }

  static async from (cid, { ipfs, get, put, cache, chunker }) {
    if (typeof cid === 'string') cid = CID.parse(cid)
    if (ipfs) {
      get = async cid => {
        const { data } = await ipfs.block.get(cid.toString())
        return createBlock(data, cid)
      }
      put = async block => {
        const opts = { cid: block.cid.toString() }
        await ipfs.block.put(block.bytes, opts)
        return true
      }
    }
    const opts = { get, cache: cache || nocache, chunker: chunker || bf(256) }
    const db = await Database.from(cid, opts)
    return new IPSQL({ ...opts, put, db, cid })
  }
}

const { from, create } = IPSQL

export { from, create, IPSQL }
