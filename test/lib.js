import IPSQL from '../src/index.js'
import { deepStrictEqual as same } from 'assert'
import { bf } from 'chunky-trees/utils'

const chunker = bf(3)

const storage = () => {
  const blocks = {}
  const put = block => {
    blocks[block.cid.toString()] = block
  }
  const get = async cid => {
    const block = blocks[cid.toString()]
    if (!block) throw new Error('Not found')
    return block
  }
  return { get, put, blocks }
}

const create = q => {
  const { get, put } = storage()
  return IPSQL.create(q, { get, put, chunker })
}

export { create, same, storage }
