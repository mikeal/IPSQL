import IPSQL from '../index.js'

class IPSQLStore {
  static async _from ({ cid, store, ...opts }) {
    const get = store.get.bind(store)
    const put = store.put.bind(store)
    const ipsql = await IPSQL.from(cid, { get, put, ...opts })
    return ipsql
  }

  static async _create (q, { store, ...opts }) {
    const get = store.get.bind(store)
    const put = store.put.bind(store)
    const ipsql = await IPSQL.create(q, { get, put, ...opts })
    return ipsql
  }
}

export default IPSQLStore
