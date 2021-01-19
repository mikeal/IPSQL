import KVStore from './kv.js'

const empty = new Uint8Array(0)

class S3Store extends KVStore {
  constructor (s3, opts = {}) {
    super(opts)
    this.keyPrefix = opts.keyPrefix || ''
    this.s3 = s3
  }

  _put (arr, Body) {
    const Key = this.keyPrefix + arr.join('/')
    return this.s3.putObject({ Key, Body }).promise()
  }

  _putKey (arr) {
    return this._put(arr, empty)
  }

  async _hasKey (arr) {
    const Key = this.keyPrefix + arr.join('/')
    let resp
    try {
      resp = await this.s3.headObject({ Key }).promise()
    } catch (e) {
      /* c8 ignore next */
      if (e.statusCode === 404) return false /* c8 ignore next */
      /* c8 ignore next */
      throw e
      /* c8 ignore next */
    }
    return { length: resp.ContentLength }
  }

  async _getKey (arr) {
    const Key = this.keyPrefix + arr.join('/')
    const resp = await this.s3.getObject({ Key }).promise()
    return resp.Body
  }

  static async from (cid, { s3, ...opts }) {
    if (!s3) {
      throw new Error('Not implemented')
    }
    const store = new S3Store(s3, opts)
    return S3Store._from({ cid, store, ...opts })
  }

  static async create (q, { s3, ...opts }) {
    if (!s3) {
      throw new Error('Not implemented')
    }
    const store = new S3Store(s3, opts)
    return S3Store._create(q, { store, ...opts })
  }
}

export default S3Store
