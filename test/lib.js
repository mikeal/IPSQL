import IPSQL from '../src/stores/inmemory.js'
import { deepStrictEqual as same } from 'assert'
import { bf } from 'chunky-trees/utils'

const create = (q, _IPSQL = IPSQL) => {
  return _IPSQL.create(q)
}

export { create, same }
