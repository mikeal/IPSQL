import KVStore from './kv.js'
import { immutable } from '../utils.js'
import s3client from '@aws-sdk/client-s3'
import { CID } from 'multiformats'
import bent from 'bent'

const {
  S3Client,
  PutObjectCommand: PutObject,
  GetObjectCommand: GetObject,
  HeadObjectCommand: HeadObject
} = s3client

class S3 {
  constructor ({ Bucket, region }) {
    this.Bucket = Bucket
    this.client = this.getClient({ Bucket, region })
  }

  async getClient ({ Bucket, region }) {
    this.Bucket = Bucket
    let client
    if (!region) {
      const head = bent(`https://${Bucket}.s3.amazonaws.com`, 200, 403)
      const resp = await head()
      region = resp.headers['x-amz-bucket-region']
    }
    client = new S3Client({ region })
    try {
      client = await client
    } catch (e) {
      client = null
    }

    if (client) {
      try {
        await client.config.credentials()
      } catch (e) {
        client = null
      }
    }

    if (!client) {
      const url = `https://${Bucket}.s3.${region}.amazonaws.com/`
      this.httpGet = bent(url)
      this.httpHead = bent(url, 'HEAD')
      return null
    }
    return client
  }

  async putObject ({ Key, Body }) {
    const client = await this.client
    if (!client) {
      throw new Error('Client could not be constructed, credentials are likely missing, S3 is read-only.')
    }
    return client.send(new PutObject({ Key, Body, Bucket: this.Bucket }))
  }

  async headObject ({ Key }) {
    const client = await this.client
    if (client) {
      return client.send(new HeadObject({ Key, Bucket: this.Bucket }))
    } else {
      const resp = await this.httpHead(Key)
      return { 'Content-Length': resp.headers['content-length'] }
    }
  }

  async getObject ({ Key }) {
    const client = await this.client
    if (client) {
      return client.send(new GetObject({ Key, Bucket: this.Bucket }))
    } else {
      const resp = await this.httpGet(Key)
      return { Body: resp }
    }
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
    const { Body } = await this.s3.getObject({ Key })
    const buff = await new Promise((resolve, reject) => {
      const parts = []
      Body.on('error', reject)
      Body.on('data', b => parts.push(b))
      Body.on('end', () => resolve(Buffer.concat(parts)))
    })
    return buff
  }

  static getStore (url, config) {
    if (!(url instanceof URL)) url = new URL(url)
    let { hostname: bucket, pathname: keyPrefix } = url
    let root
    if (keyPrefix.endsWith('.cid')) {
      const i = keyPrefix.lastIndexOf('/')
      let cid = keyPrefix.slice(i + 1)
      keyPrefix = keyPrefix.slice(0, i)
      cid = cid.slice(0, cid.length - '.cid'.length)
      root = CID.parse(cid)
    }
    const store = new S3Store({ bucket, keyPrefix, db: 'headless' })
    return { get: store.get.bind(store), put: store.put.bind(store), root }
  }
}

export default S3Store
