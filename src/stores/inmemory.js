import IPSQLStore from './base.js'

class Missing extends Error {
  get statusCode () {
    return 404
  }
}

class InMemory extends IPSQLStore {
  constructor (opts) {
    super(opts)
    Object.defineProperty(this, 'storage', {
      value: opts.storage || new Map(),
      writable: false,
      enumerable: true
    })
  }

  async put (block) {
    this.storage.set(block.cid.toString(), block)
  }

  async has (cid) {
    return this.storage.has(cid.toString())
  }

  async get (cid) {
    const key = cid.toString()
    const value = this.storage.get(key)
    if (!value) throw new Missing(`Do not have ${key} in store`)
    return value
  }
}

export default InMemory
