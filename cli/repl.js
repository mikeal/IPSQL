import cliffy from 'cliffy'
import { CID } from 'multiformats'

const { CLI } = cliffy

const create = ({ db, store, chunker, hasher, remote }) => {
  const cli = new CLI()
  cli.setDelimiter('> ')
  const setDatabase = db => {
    cli.addCommand('query', {
      description: 'Run SQL query against current database.',
      parameters: [ 'sql' ],
      action: async ({ sql }) => {
        if (remote) {
          throw new Error('Not implemented')
        }
        const result = await db.read(sql)
        console.log(result)
      }
    })
  }
  if (db) setDatabase(db)
  cli.addCommand('database', {
    description: 'Set the database to a new CID in the store.',
    parameters: [ 'cid' ],
    action: async ({ cid }) => {
      cid = CID.parse(cid)
      const db = await IPSQL.from(cid, { ...store, chunker, hasher })
      setDatabase(db)
    }
  })
  return cli
}

export default create
