import IPSQLStore from './base.js'

class Missing extends Error {
  get statusCode () {
    return 404
  }
}

class InMemory extends IPSQLStore {
  constructor () {
    super({})
    this.storage = new Map()
    this.links = { to: new Map(), from: new Map() }
    this.complete = new Set()
    this.depthLimit = 1024
  }

  _put (cid, block) {
    this.storage.set(cid.toString('base32'), block)
  }

  async put (block) {
    const cid = await block.cid()
    this._put(cid, block)
    this._index(cid, block)
  }

  has (cid) {
    const key = cid.toString()
    if (!this.links.from.has(key)) {
      return false
    } else {
      const { bytes: { length } } = this.storage.get(key)
      return new Promise(resolve => resolve({ length }))
    }
  }

  async get (cid) {
    const key = cid.toString()
    const value = this.storage.get(key)
    if (!value) throw new Missing(`Do not have ${key} in store`)
    return value
  }

  static async from (cid, { ...opts }) {
    const store = new InMemory()
    return InMemory._from({ cid, store, ...opts })
  }

  static async create (q, { ...opts }) {
    const store = new InMemory()
    return InMemory._create(q, { store, ...opts })
  }
}

export default InMemory
