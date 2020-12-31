import { createBlock } from './utils.js'

const ipfsStore = ipfs => {
  const waitingGets = new Set()
  const waitingPuts = new Set()
  const stat = async key => {
    let pass = false
    let i = 0
    while (!pass && i < 100) {
      try {
        const opts = { timeout: 10 + i }
        await ipfs.block.get(key, opts)
        pass = true
      } catch (e) {
        if (e.message !== 'request timed out') throw e
      }
      i++
    }
    return pass
  }
  const get = async cid => {
    const key = cid.toString()
    while (waitingPuts.has(key)) {
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    waitingGets.add(key)
    const { data } = await ipfs.block.get(key)
    waitingGets.delete(key)
    return createBlock(data, cid)
  }
  const put = async (block, retries=3) => {
    const key = block.cid.toString()
    waitingPuts.add(key)
    const opts = { cid: key, timeout: 1000 }
    await ipfs.block.put(block.bytes, opts)
    // there's no transactional integrity due to bugs in js-ipfs,
    // we have to stat the cid to know when it's available and sometimes it never is
    // and we need to retry the entire write
    let _stat = await stat(key)
    if (!_stat) {
      if (retries) return put(block, retries - 1)
      else throw new Error('Put failed')
    }
    // await ipfs.pin.add(key, { recursive: false })
    waitingPuts.delete(key)
    return true
  }
  return { get, put }
}

export default ipfsStore
