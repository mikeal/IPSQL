import KVStore from './kv.js'
import levelup from 'levelup'
import encoding from 'encoding-down'
import charwise from 'charwise'

class LevelStore extends KVStore {
  constructor (leveldown, opts = {}) {
    super(opts)
    this.lev = levelup(encoding(leveldown, { valueEncoding: 'binary', keyEncoding: charwise }))
    this.prefix = opts.prefix || '_kv-bs'
  }

  _mkey (arr) {
    return [this.prefix, ...arr]
  }

  _put (arr, body) {
    return this.lev.put(this._mkey(arr), body)
  }

  async _hasKey (arr) {
    let resp
    try {
      resp = await this.lev.get(this._mkey(arr))
    } catch (e) {
      /* c8 ignore next */
      if (e.status === 404) return false /* c8 ignore next */
      /* c8 ignore next */
      throw e
      /* c8 ignore next */
    }
    return { length: resp.length }
  }

  async _getKey (arr) {
    try {
      return await this.lev.get(this._mkey(arr))
    } catch (e) {
      e.statusCode = e.status
      throw e
    } /* c8 ignore next */
  }

  static async from (cid, { leveldown, ...opts }) {
    const store = new LevelStore(leveldown, opts)
    return LevelStore._from({ cid, store, ...opts })
  }

  static async create (q, { leveldown, ...opts }) {
    const store = new LevelStore(leveldown, opts)
    return LevelStore._create(q, { store, ...opts })
  }
}

export default LevelStore
