import IPSQL from '../src/stores/inmemory.js'
import { deepStrictEqual as same } from 'assert'

const create = (q, _IPSQL = IPSQL) => {
  return _IPSQL.create(q)
}

export { create, same }
