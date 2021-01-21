import IPSQLStore from './base.js'
import LRU from 'lru-cache'
import { immutable } from '../utils.js'

const defaultSize = 1024 * 1024 * 50
const getLength = block => block.bytes.byteLength + block.cid.bytes.byteLength

class LRUStore extends IPSQLStore {
  constructor (opts) {
    super(opts)
    if (opts.lru === false) return immutable(this, { lru: false })
    immutable(this, {
      lru: opts.lru || new LRU({ max: opts.lruSize || defaultSize, length: getLength })
    })
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
