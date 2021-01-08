import IPSQL from 'ipsql'
import { createBlock } from 'ipsql/utils'
import cache from 'ipsql/cache'
import network from 'ipsql/network'
import csv from 'ipsql/csv'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { CID } from 'multiformats'
import { bf } from 'chunky-trees/utils'
import fs from 'fs'
import { Readable } from 'stream'
import getPort from 'get-port'
import publicIP from 'public-ip'
import repl from './repl.js'
import { CarReader, CarWriter } from '@ipld/car'
import bent from 'bent'

const httpGet = bent({ 'user-agent': 'ipsql-v0' })
const httpGetString = bent('string', { 'user-agent': 'ipsql-v0' })
const isHttpUrl = str => str.startsWith('http://') || str.startsWith('https://')

const chunker = bf(256)

const importOptions = yargs => {
  yargs.option('database', {
    describe: 'Optional IPSQL database to import into. New DB will be created if not set'
  })
  yargs.option('tableName', {
    describe: 'Optional Table Name. One will be generated from the import file if not set'
  })
  yargs.positional('input', {
    describe: 'CSV input file'
  })
}

const queryOptions = yargs => {
  yargs.positional('URI', {
    describe: 'URI for database'
  })
  yargs.positional('sql', {
    describe: 'SQL query string to run'
  })
  yargs.option('format', {
    describe: 'Output format',
    default: 'csv'
  })
  yargs.option('export', {
    describe: 'Export blocks for query'
  })
}

const mkopts = argv => ({ cache: cache(), chunker })

const inmem = () => {
  const store = {}
  const get = async cid => {
    const key = cid.toString()
    if (!store[key]) throw new Error('Not found')
    return store[key]
  }
  const put = async block => {
    const key = block.cid.toString()
    store[key] = block
  }
  return { get, put }
}

const getStore = argv => {
  if (argv.store === 'inmem' || argv.store === 'inmemory') {
    return inmem()
  }
  let store
  let get
  let put
  if (argv.input === 'inmem' || argv.input === 'inmemory') {
    store = inmem()
    get = store.get
  }
  if (argv.output === 'inmem' || argv.input === 'inmemory') {
    if (!store) store = inmem()
    put = store.put
  }
  if (!get || !put) throw new Error('Cannot configure storage')
  return { get, put }
}

const fromURI = async (uri, put, store) => {
  let cid
  let getBlock
  let query
  let close
  if (uri.startsWith('tcp://')) {
    const { client } = network()
    const { hostname, port, pathname } = new URL(uri)
    const remote = await client(+port, hostname)
    cid = CID.parse(pathname.slice('/'.length))
    getBlock = cid => remote.getBlock(cid.toString()).then(bytes => createBlock(bytes, cid))
    query = (cid, sql) => remote.query(cid.toString(), sql)
    close = () => remote.close()
  } else {
    if (!uri.endsWith('.car')) throw new Error('Unknown uri')
    let stream
    if (isHttpUrl(uri)) {
      stream = await httpGet(uri)
    } else {
      stream = fs.createReadStream(uri)
    }
    const reader = await CarReader.fromIterable(stream)
    const [root] = await reader.getRoots()
    cid = root
    getBlock = async cid => {
      const block = await reader.get(cid)
      if (!block) throw new Error('Not found')
      const { bytes } = block
      return createBlock(bytes, cid)
    }
    query = async (cid, sql) => {
      const db = await IPSQL.from(cid, { get: getBlock, put: readOnly, ...mkopts() })
      const { result, cids } = await db.read(sql, true)
      return { result, cids: await cids.all() }
    }
    close = () => {}
  }
  const get = async cid => {
    if (store) {
      try {
        const ret = await store.get(cid)
        return ret
      } catch (e) {
        if (!e.message.toLowerCase().includes('not found')) throw e
      }
    }
    const block = await getBlock(cid)
    return block
  }
  return { cid, close, getBlock, query, database: () => IPSQL.from(CID.parse(cid), { get, put, ...mkopts() }) }
}

const readOnly = block => { throw new Error('Read-only storage mode, cannot write blocks') }

const runExport = async ({ argv, cids, root, getBlock, store }) => {
  if (!cids) throw new Error('asdf')
  if (!argv.export.endsWith('.car')) throw new Error('Can only export CAR files')
  let has = () => false
  if (argv.diff) {
    if (!argv.diff.endsWith('.car')) throw new Error('Can only diff CAR files')
    let stream
    if (isHttpUrl(argv.diff)) {
      stream = httpGet(argv.diff)
    } else {
      stream = fs.createReadStream(argv.diff)
    }
    const { reader } = CarReader.fromIterable(stream)
    has = cid => reader.has(cid)
  }
  const { writer, out } = await CarWriter.create([root])
  Readable.from(out).pipe(fs.createWriteStream(argv.export))
  if (store) {
    getBlock = cid => store.get(cid)
  }
  const promises = []
  for (const key of cids) {
    const cid = CID.parse(key)
    if (!(await has(cid))) {
      const p = getBlock(cid).then(block => writer.put(block))
      promises.push(p)
    }
  }
  await Promise.all(promises)
  await writer.close()
}

const runQuery = async argv => {
  const { query, getBlock, cid, close } = await fromURI(argv.uri, readOnly)
  const { result, cids } = await query(cid, argv.sql)

  let exporter
  if (argv.export) exporter = runExport({ argv, cids, root: cid, query, getBlock })

  let print
  if (argv.format === 'json') {
    print = obj => JSON.stringify(obj)
  } else if (argv.format === 'csv') {
    print = obj => obj.map(v => JSON.stringify(v)).join(',')
  } else {
    throw new Error('Unknown output format')
  }
  if (Array.isArray(result) && Array.isArray(result[0])) {
    for (const row of result) {
      console.log(print(row))
    }
  } else {
    console.log(JSON.stringify(result))
  }

  await exporter
  await close()
}

const runRepl = async argv => {
  // TODO: run repl with --store option for connecting with local storage
  const store = inmem()
  const { remote, cid } = await fromURI(argv.uri, readOnly, store)
  const cli = repl({ remote, cid, store })
  cli.show()
}

const getTableName = argv => argv.tableName || argv.input.slice(argv.input.lastIndexOf('/') + 1)

const preImport = async (argv, store) => {
  if (!store) store = getStore(argv)
  let input
  if (isHttpUrl(argv.input)) {
    input = await httpGetString(argv.input)
  } else {
    input = fs.readFileSync(argv.input).toString()
  }
  const tableName = getTableName(argv)
  const db = await csv({ ...argv, ...mkopts(), ...store, input, tableName })
  return { db, store, input, tableName }
}

const runImportExport = async (argv) => {
  argv.export = argv.output
  const { db, store } = await preImport(argv, inmem())
  let cids
  if (argv.query) {
    cids = await db.read(argv.query, true).then(({ cids }) => cids.all())
  } else {
    cids = await db.cids()
  }
  await runExport({ argv, cids, root: db.cid, store })
}

const runImportRepl = async (argv) => {
  const { db, store } = await preImport(argv, inmem())
  const cli = repl({ db, store, ...mkopts() })
  cli.show()
}

const runImportServe = async argv => {
  console.log('importing...')
  const { db, store } = await preImport(argv, inmem())
  const { listen } = network({ store })
  const port = argv.port ? +argv.port : await getPort({ port: 8000 })

  let pub
  if (argv.host.includes(':')) pub = await publicIP.v6()
  else pub = await publicIP.v4()

  await listen(port)
  console.log(`tcp://${pub}:${port}/${db.cid.toString()}`)
}

const y = yargs(hideBin(process.argv))
  .command('query <uri> <sql>', 'Run IPSQL query', queryOptions, runQuery)
  .command('repl <uri>', 'Run local REPL', queryOptions, runRepl)
  .command('import', 'Import CSV files', yargs => {
    yargs.command('export <input> <output>', 'Export blocks', yargs => {
      importOptions(yargs)
      yargs.positional('output', {
        describe: 'File to export to. File extension selects export type'
      })
      yargs.option('query', {
        describe: 'SQL query to export rather than full database'
      })
    }, runImportExport)
    yargs.command('serve <input> [port] [host]', 'Serve the imported database', yargs => {
      importOptions(yargs)
      yargs.positional('port', { describe: 'PORT to bind to' })
      yargs.positional('host', { describe: 'HOST IP address', default: '0.0.0.0' })
    }, runImportServe)
    yargs.command('repl <input>', 'Start REPL for imported db', yargs => {
      importOptions(yargs)
    }, runImportRepl)
  }, () => y.showHelp())

export default y

if (y.argv._.length === 0) y.showHelp()
