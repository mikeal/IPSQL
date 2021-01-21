import LRU from 'lru-cache'
import lfs from 'lfs-store'
import getRepo from 'git-remote-origin-url'

const defaults = {
  max: 1024 * 1024 * 50,
  length: block => block.bytes.byteLength + block.cid.bytes.byteLength
}

/* c8 ignore next */
const getUser = str => {
  /* c8 ignore next */
  str = str.slice(0, str.lastIndexOf('/'))
  /* c8 ignore next */
  return str.slice(str.lastIndexOf('/') + 1)
  /* c8 ignore next */
}

export default (opts = {}) => {
  const lru = new LRU({ ...defaults, ...opts })
  return async (filepath = './blockstore.ipld-lfs', repo, user, token, disableCache) => {
    if (!repo) repo = await getRepo()
    if (!user) user = process.env.GITHUB_ACTOR /* c8 ignore next */ || getUser(repo)
    if (!token) token = /* c8 ignore next */ process.env.GHTOKEN || /* c8 ignore next */ process.env.GITHUB_TOKEN
    const store = await lfs(filepath, repo, user, token)
    const get = async cid => {
      const key = cid.toString()
      if (!disableCache && lru.has(key)) return lru.get(key)
      const block = await store.get(cid)
      if (!disableCache) /* c8 ignore next */ lru.set(key, block)
      return block
    }
    const put = async block => {
      const cid = await block.cid()
      const key = cid.toString()
      if (!disableCache && lru.has(key)) return lru.get(key)
      await store.put(block)
      if (!disableCache) lru.set(key, block)
    }
    return { get, put, close: () => store.close() }
  }
}
