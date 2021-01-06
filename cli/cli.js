#!/usr/bin/env node
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import IPSQL from '../src/index.js'
import { bf } from 'chunky-trees/utils'
import { createBlock } from '../src/utils.js'
import cache from '../src/cache.js'
import network from '../src/network.js'
import { CID } from 'multiformats'
import csv from '../src/csv.js'
import fs from 'fs'
import getPort from 'get-port'
import publicIP from 'public-ip'
import repl from './repl.js'

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
  if (!uri.startsWith('tcp://')) throw new Error('Unsupported transport')
  const { client } = network()
  const { hostname, port, pathname } = new URL(uri)
  const remote = await client(+port, hostname)
  const cid = pathname.slice('/'.length)
  const get = async cid => {
    if (store) {
      try {
        const ret = await store.get(cid)
        return ret
      } catch (e) {
        if (!e.message.toLowerCase().includes('not found')) throw e
      }
    }
    const bytes = await remote.getBlock(cid.toString())
    const block = await createBlock(bytes, cid)
    return block
  }
  return { remote, cid, database: () => IPSQL.from(CID.parse(cid), { get, put, ...mkopts() }) }
}

const readOnly = block => { throw new Error('Read-only storage mode, cannot write blocks') }

const runQuery = async argv => {
  const { remote, cid } = await fromURI(argv.uri, readOnly)
  const { result } = await remote.query(cid, argv.sql)
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
  await remote.close()
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
  const input = fs.readFileSync(argv.input).toString()
  const tableName = getTableName(argv)
  const db = await csv({ ...argv, ...mkopts(), ...store, input, tableName })
  return { db, store, input, tableName }
}

const runImportExport = async (argv) => {
  const { db } = await preImport(argv)
  console.log(db.cid.toString())
  console.log('Not Implemented')
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

if (y.argv._.length === 0) y.showHelp()
