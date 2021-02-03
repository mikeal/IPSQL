import IPSQL from '../index.js'
import IPSQLStore from './base.js'
import { immutable } from '../utils.js'

class Missing extends Error {
  get statusCode () {
    return 404
  }
}

class InMemory extends IPSQLStore {
  constructor (opts) {
    super(opts)
    immutable(this, { storage: opts.storage || new Map() })
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

  static headless () {
    return new InMemory({ cid: 'headless', cache: IPSQL.defaults.cache })
  }
}

export default InMemory
