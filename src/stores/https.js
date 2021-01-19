import bent from 'bent'
import LRUStore from './lru.js'
import { create } from '../block.js'

class HttpsStore extends LRUStore {
  constructor (baseurl, opts) {
    super(opts)
    let url
    let params
    if (baseurl.includes('?')) {
      url = baseurl.slice(0, baseurl.indexOf('?'))
      params = (new URL(baseurl)).searchParams
    } else {
      url = baseurl
    }
    this.url = url
    this.params = params
    this._getBuffer = bent('buffer')
    this._getJSON = bent('json')
    this._put = bent('PUT', 201)
    this._head = bent('HEAD', 200, 404)
  }

  mkurl (path, params) {
    let u = this.url
    if (!u.endsWith('/')) u += '/'
    u += path
    if (!params) params = this.params
    if (params) u += `?${params.toString()}`
    return u
  }

  async _getBlock (cid) {
    const buf = await this._getBuffer(this.mkurl(cid.toString()))
    const data = buf instanceof ArrayBuffer /* c8 ignore next */ ? new Uint8Array(buf) : buf
    return create({ bytes: data, cid })
  }

  _putBlock ({ cid, bytes }) {
    const url = this.mkurl(cid.toString())
    return this._put(url, bytes)
  }

  async _hasBlock (cid) {
    const resp = await this._head(this.mkurl(cid.toString()))
    if (resp.statusCode === 200) return true
    else return false /* c8 ignore next */
  }

  static async from (url, opts) {
    if (url.endsWith('/')) url = url.slice(0, url.length - 2)
    const l = url.lastIndexOf('/')
    const baseurl = url.slice(0, l)
    const cid = url.slice(l + 1)
    const store = new HttpsStore(baseurl, opts)
    return HttpsStore._from({ cid, store, ...opts })
  }

  static async create (url, q, opts) {
    const store = new HttpsStore(url, opts)
    return HttpsStore._create(q, { store, ...opts })
  }
}

export default HttpsStore
