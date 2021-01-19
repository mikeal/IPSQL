import IPSQLStore from './base.js'
import LRU from 'lru-cache'

const defaultSize = 1024 * 1024 * 50
const getLength = block => block.bytes.length

class LRUStore extends IPSQLStore {
  constructor (opts = {}) {
    super(opts)
    if (typeof opts.lru === 'undefined') opts.lru = true
    if (opts.lru) {
      this.lru = new LRU({ max: opts.lruSize || defaultSize, length: getLength })
    }
    this.depthLimit = opts.depthLimit || 1024
  }

  async get (cid) {
    if (!this.lru) return this._getBlock(cid)
    const key = cid.toString()
    if (this.lru.has(key)) return this.lru.get(key)
    const block = await this._getBlock(cid)
    this.lru.set(key, block)
    return block
  }

  async put (block) {
    if (!this.lru) return this._putBlock(block)
    const key = block.cid.toString()
    if (this.lru.has(key)) return
    const ret = await this._putBlock(block)
    this.lru.set(key, block)
    return ret
  }

  has (cid) {
    if (!this.lru) return this._hasBlock(cid)
    const key = cid.toString()
    if (this.lru.has(key)) return { length: this.lru.get(key).bytes.byteLength }
    return this._hasBlock(cid)
  }
}

export default LRUStore
