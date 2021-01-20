import { encode, decode, create as _create } from 'multiformats/block'
import * as codec from '@ipld/dag-cbor'
import raw from 'multiformats/codecs/raw'
import json from 'multiformats/codecs/json'
import { sha256 as hasher } from 'multiformats/hashes/sha2'
import * as ecodec from 'encrypted-block'

const mf = { hasher, codec }
const encoder = value => encode({ value, ...mf })
const decoder = bytes => decode({ bytes, ...mf })

const codeMap = new Map()

for (const c of [codec, raw, json, hasher, ecodec]) {
  codeMap.set(c.code, c)
}

const create = ({ cid, bytes }) => {
  const codec = codeMap.get(cid.code)
  if (!codec) throw new Error(`No codec for code:${cid.code}`)
  const hasher = codeMap.get(cid.multihash.code)
  if (!hasher) throw new Error(`No hasher for code:${cid.multihash.code}`)
  return _create({ cid, bytes, hasher, codec })
}

export { encoder, decoder, create, mf }
