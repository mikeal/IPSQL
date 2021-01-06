#!/usr/bin/env node
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import IPSQL from '../src/index.js'
import { bf } from 'chunky-trees/utils'
import cache from '../src/cache.js'
import network from '../src/network.js'
import { CID } from 'multiformats'
import csv from '../src/csv.js'
import fs from 'fs'
import getPort from 'get-port'
import publicIP from 'public-ip'

const chunker = bf(256)

const importOptions = yargs => {
  yargs.positional('file', {
    describe: 'CSV file to import'
  })
  yargs.option('database', {
    describe: 'Optional IPSQL database to import into. New DB will be created if not set'
  })
  yargs.option('tableName', {
    describe: 'Optional Table Name. One will be generated from the import file if not set'
  })
}

const options = yargs => {
  yargs.positional('cid', {
    describe: 'CID (Content Identifier) of the IPSQL Database'
  })
  yargs.positional('sql', {
    describe: 'SQL query string to run'
  })
  yargs.option('format', {
    describe: 'Output format',
    default: 'json'
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
  if (argv.output === 'inmem' || arv.input === 'inmemory') {
    if (!store) store = inmem()
    put = store.put
  }
  if (!get || !put) throw new Error('Cannot configure storage')
  return { get, put }
}

const run = async argv => {
  const db = await getDatabase(argv, argv.cid)
  const results = await db.read(argv.sql)
  console.log(JSON.stringify(results, null, 2))
}

const runImportExport = async argv => {
  const input = fs.readFileSync(argv.input).toString()
  const store = getStore(argv)
  const db = await csv({ ...argv, ...mkopts(), ...store, input })
}

const runImportServe = async argv => {
  const input = fs.readFileSync(argv.input).toString()
  const store = inmem()
  console.log('importing...')
  const db = await csv({ ...argv, ...mkopts(), ...store, input})
  const { server, listen } = network(store)
  const port = argv.port ? +argv.port : await getPort(8000)

  let pub
  if (argv.host.includes(':')) pub = await publicIP.v6()
  else pub = await publicIP.v4()

  await listen(port)
  console.log(`tcp://${ pub }:${ port }/${ db.cid.toString() }`)
}

const csvArgs = yargs => {
  yargs.positional('input', {
    describe: 'CSV input file'
  })
}

const y = yargs(hideBin(process.argv))
  .command('query <uri> <sql>', 'Run IPSQL query', options, run)
  .command('import', 'Import CSV files', yargs => {
    yargs.command('export <input> <output>', 'Export blocks', yargs => {
      csvArgs(yargs)
      yargs.positional('output', {
        describe: 'File to export to. File extension selects export type'
      })
    }, runImportExport)
    yargs.command('serve <input> [port] [host]', 'Serve the imported database', yargs => {
      csvArgs(yargs)
      yargs.positional('port', { describe: 'PORT to bind to' })
      yargs.positional('host', { describe: 'HOST IP address', default: '0.0.0.0' })
    }, runImportServe)
  }, () => y.showHelp())

y.argv
