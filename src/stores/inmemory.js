import IPSQLStore from './base.js'

class Missing extends Error {
  get statusCode () {
    return 404
  }
}

const storage = new Map()

class InMemory extends IPSQLStore {
  async put (block) {
    storage.set(block.cid.toString(), block)
  }

  async has (cid) {
    return storage.has(cid.toString())
  }

  async get (cid) {
    const key = cid.toString()
    const value = storage.get(key)
    if (!value) throw new Missing(`Do not have ${key} in store`)
    return value
  }
}

export default InMemory
