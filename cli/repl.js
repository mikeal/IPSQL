import cliffy from 'cliffy'
import { CID } from 'multiformats'
import IPSQL from '../src/index.js'

const { CLI } = cliffy

const create = ({ db, cid, store, chunker, hasher, remote }) => {
  const cli = new CLI()
  cli.setDelimiter('> ')
  cli.addCommand('query', {
    description: 'Run SQL query against current database.',
    parameters: ['sql'],
    action: async ({ sql }) => {
      if (!db) {
        if (!remote || !cid) throw new Error('Must have db or remote and cid set.')
        const { result } = await remote.query(cid, sql)
        console.log(result)
      } else {
        const result = await db.read(sql)
        console.log(result)
      }
    }
  })
  cli.addCommand('database', {
    description: 'Set the database to a new CID in the store.',
    parameters: ['cid'],
    action: async ({ cid }) => {
      cid = CID.parse(cid)
      db = await IPSQL.from(cid, { ...store, chunker, hasher })
    }
  })
  return cli
}

export default create
