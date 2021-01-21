import KVStore from './kv.js'
import { immutable } from '../utils.js'
import s3client from '@aws-sdk/client-s3'

const {
  S3Client,
  PutObjectCommand: PutObject,
  GetObjectCommand: GetObject,
  HeadObjectCommand: HeadObject
} = s3client

class S3 {
  constructor ({ Bucket, region }) {
    this.Bucket = Bucket
    this.client = new S3Client(region ? { region } : undefined)
  }

  putObject ({ Key, Body }) {
    return this.client.send(new PutObject({ Key, Body, Bucket: this.Bucket }))
  }

  headObject ({ Key }) {
    return this.client.send(new HeadObject({ Key, Bucket: this.Bucket }))
  }

  getObject ({ Key }) {
    return this.client.send(new GetObject({ Key, Bucket: this.Bucket }))
  }
}

class S3Store extends KVStore {
  constructor ({ s3, bucket, region, ...opts }) {
    super(opts)
    immutable(this, {
      bucket,
      keyPrefix: opts.keyPrefix || '',
      s3: s3 || new S3({ Bucket: bucket, region })
    })
  }

  _put (arr, Body) {
    const Key = arr.join('/')
    return this.s3.putObject({ Key, Body })
  }

  async _hasKey (arr) {
    const Key = this.keyPrefix + arr.join('/')
    let resp
    try {
      resp = await this.s3.headObject({ Key })
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
    const resp = await this.s3.getObject({ Key })
    return resp.Body
  }

  static getStore (url, config) {
    if (!(url instanceof URL)) url = new URL(url)
    const { hostname: bucket, pathname: keyPrefix } = url
    const store = new S3Store({ bucket, keyPrefix, db: true })
    return { get: store.get.bind(store), put: store.put.bind(store) }
  }
}

export default S3Store
