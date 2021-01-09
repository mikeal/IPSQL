import { sha256 as hasher } from 'multiformats/hashes/sha2'
import * as codec from '@ipld/dag-cbor'
import * as ecodec from 'encrypted-block'
import raw from 'multiformats/codecs/raw'
import { encode as encoder, decode as decoder, create } from 'multiformats/block'

const mf = { codec, hasher }

const codecs = {}
codecs[codec.code] = codec
codecs[ecodec.code] = ecodec
codecs[raw.code] = raw

const encode = value => encoder({ value, ...mf })
const decode = bytes => decoder({ bytes, ...mf })
const createBlock = (bytes, cid) => {
  const codec = codecs[cid.code]
  if (!codec) throw new Error('Unsupported Codec')
  return create({ bytes, cid, hasher, codec })
}

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

export { immediate, getNode, mf, encode, decode, hasher, codec, createBlock, SQLBase }
