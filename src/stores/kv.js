import LRUStore from './lru.js'
import { create } from '../block.js'

class KVStore extends LRUStore {
  async _putBlock (block) {
    const { cid, bytes } = block
    await this._put([cid.toString(), 'encode'], bytes)
  }

  _hasBlock (cid) {
    return this._hasKey([cid.toString(), 'encode'])
  }

  async _getBlock (cid) {
    const key = cid.toString()
    const data = await this._getKey([key, 'encode'])
    return create({ bytes: data, cid })
  }
}

export default KVStore
