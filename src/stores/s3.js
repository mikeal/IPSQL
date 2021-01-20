import KVStore from './kv.js'
import { immutable } from '../utils.js'

class S3Store extends KVStore {
  constructor ({ s3, ...opts }) {
    super(opts)
    immutable(this, {
      keyPrefix: opts.keyPrefix || '',
      s3: s3
    })
  }

  _put (arr, Body) {
    const Key = this.keyPrefix + arr.join('/')
    return this.s3.putObject({ Key, Body }).promise()
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
}

export default S3Store
