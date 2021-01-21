import * as codec from '@ipld/dag-cbor'
import { sha256 as hasher } from 'multiformats/hashes/sha2'
import { encoder as encode, decoder as decode, create, mf } from './block.js'

const createBlock = (bytes, cid) => create({ bytes, cid })

const immediate = () => new Promise(resolve => setImmediate(resolve))

const getNode = async (cid, get, cache, create) => {
  if (cache.has(cid)) {
    return cache.get(cid)
  }
  const block = await get(cid)
  const node = await create(block)
  if (node.address) cache.set(node)
  return node
}

class SQLBase {
  constructor ({ block, get }) {
    this.block = block || this.encode()
    this.address = this.block.then ? this.block.then(b => b.cid) : this.block.cid
  }

  async encode () {
    if (this.block) return this.block
    await immediate()
    const node = await this.encodeNode()
    return encode(node)
  }
}

const immutable = (obj, props) => {
  const writes = {}
  for (const [key, value] of Object.entries(props)) {
    writes[key] = { value, writable: false, enumerable: true }
  }
  Object.defineProperties(obj, writes)
}

export { immediate, immutable, getNode, mf, encode, decode, codec, hasher, createBlock, SQLBase }
