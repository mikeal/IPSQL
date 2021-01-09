import IPSQL from 'ipsql'
import { createBlock } from 'ipsql/utils'
import cache from 'ipsql/cache'
import network from 'ipsql/network'
import csv from 'ipsql/csv'
import { Database } from 'ipsql/database'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { CID } from 'multiformats'
import { bf } from 'chunky-trees/utils'
import { Readable } from 'stream'
import getPort from 'get-port'
import publicIP from 'public-ip'
import repl from './repl.js'
import { CarReader, CarWriter } from '@ipld/car'
import bent from 'bent'
import { randomBytes } from 'crypto'
import { writeFileSync, readFileSync, createReadStream, createWriteStream } from 'fs'
import { sha256 as hasher } from 'multiformats/hashes/sha2'
import { encrypt, decrypt } from './crypto.js'

const httpGet = bent({ 'user-agent': 'ipsql-v0' })
const httpGetString = bent('string', { 'user-agent': 'ipsql-v0' })
const isHttpUrl = str => str.startsWith('http://') || str.startsWith('https://')

const chunker = bf(256)

const stack = (...gets) => async (...args) => {
  for (const get of gets) {
    try {
      const ret = await get(...args)
      return ret
    } catch (e) {
      if (!e.message.toLowerCase().includes('not found')) throw e
    }
  }
  throw new Error('Not found')
}

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

const uriOptions = yargs => yargs.positional('URI', { describe: 'URI for database' })
const sqlOptions = yargs => {
  yargs.positional('sql', { describe: 'SQL query string to run' })
  yargs.option('export', { describe: 'Export blocks for query' })
  yargs.option('encrypt', { describe: 'Encrypt the exported graph with the given keyfile' })
  yargs.option('decrypt', { describe: 'Decrypt the target graph before running the query' })
}

const queryOptions = yargs => {
  uriOptions(yargs)
  sqlOptions(yargs)
  yargs.option('format', {
    describe: 'Output format',
    default: 'csv'
  })
}

const mkopts = argv => ({ cache: cache(), chunker, hasher })

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

const getStore = async argv => {
  if (argv.store === 'inmem' || argv.store === 'inmemory') {
    return inmem()
  }

  let store
  let get
  let put
  let root

  if (argv.store) {
    // TODO: support tcp URLs as a store
    const { reader } = await getReader(argv.store)
    const [_root] = await reader.getRoots()
    root = _root
    get = (...args) => reader.get(...args).then(({ bytes, cid }) => createBlock(bytes, cid))
    put = readOnly
    // TODO: when we support S3 and leveldb this will need a put method as well
  }

  if (argv.input === 'inmem' || argv.input === 'inmemory') {
    store = inmem()
    get = store.get
  }
  if (argv.output === 'inmem' || argv.input === 'inmemory') {
    if (!store) store = inmem()
    put = store.put
  }
  if (!get || !put) throw new Error('Cannot configure storage')
  return { get, put, root }
}

const getReader = async uri => {
  if (!uri.endsWith('.car')) throw new Error('Unknown uri')
  let stream
  if (isHttpUrl(uri)) {
    stream = await httpGet(uri)
  } else {
    stream = createReadStream(uri)
  }
  const reader = await CarReader.fromIterable(stream)
  const [root] = await reader.getRoots()
  return { reader, root }
}

const fromURI = async (uri, put, store, key) => {
  let cid
  let getBlock
  let query
  let close
  if (uri.startsWith('tcp://')) {
    if (key) throw new Error('Not implemented: Cannot decrypt from tcp store yet')
    const { client } = network()
    const { hostname, port, pathname } = new URL(uri)
    const remote = await client(+port, hostname)
    cid = CID.parse(pathname.slice('/'.length))
    getBlock = cid => remote.getBlock(cid.toString()).then(bytes => createBlock(bytes, cid))
    query = (cid, sql) => remote.query(cid.toString(), sql)
    // TODO: see if we can get rid of closes with socket.unref()
    close = () => remote.close()
  } else {
    const { root, reader } = await getReader(uri)

    if (key) {
      if (typeof key === 'string') key = readFileSync(key)
      // the graph is encrypted, we need to decrypt it
      if (!store) store = inmem()
      const _get = cid => reader.get(cid).then(({ bytes }) => createBlock(bytes, cid))
      let last
      for await (const block of decrypt({ root, get: _get, ...mkopts(), key})) {
        await store.put(block)
        last = block
      }
      getBlock = stack(cid => store.get(cid), _get)
      cid = last.cid
    } else {
      cid = root
      getBlock = async cid => {
        const block = await reader.get(cid)
        if (!block) throw new Error('Not found')
        const { bytes } = block
        return createBlock(bytes, cid)
      }
    }
    query = async (cid, sql) => {
      const db = await IPSQL.from(cid, { get: getBlock, put, ...mkopts() })
      const { result, cids } = await db.read(sql, true)
      return { result, cids: await cids.all() }
    }
    close = () => {}
  }
  let get
  if (store) get = stack(store.get.bind(store), getBlock)
  else get = getBlock

  cid = typeof cid === 'string' ? CID.parse(cid) : cid

  const database = () => IPSQL.from(cid, { get, put, ...mkopts() })
  return { cid, close, getBlock, query, database }
}

const readOnly = block => { throw new Error('Read-only storage mode, cannot write blocks') }

const runExport = async ({ argv, cids, root, getBlock, store }) => {
  if (!cids) throw new Error('asdf')
  if (!argv.export.endsWith('.car')) throw new Error('Can only export CAR files')

  if (store) {
    getBlock = cid => store.get(cid)
  }

  let has = () => false
  let get
  if (argv.diff) {
    if (!argv.diff.endsWith('.car')) throw new Error('Can only diff CAR files')
    let stream
    if (isHttpUrl(argv.diff)) {
      stream = httpGet(argv.diff)
    } else {
      stream = createReadStream(argv.diff)
    }
    const { reader } = CarReader.fromIterable(stream)
    has = cid => reader.has(cid)
    get = getBlock ? stack(getBlock, cid => reader.get(cid)) : cid => reader.get(cid)
  }

  if (argv.encrypt) {
    const key = readFileSync(argv.encrypt)
    const blocks = []
    const opts = { key, root, cids, get: get || getBlock, ...mkopts() }
    let last
    console.log(opts)
    for await (const block of encrypt(opts)) {
      blocks.push(block)
      last = block
    }
    const { writer, out } = await CarWriter.create([last.cid])
    Readable.from(out).pipe(createWriteStream(argv.export))
    await Promise.all(blocks.map(block => writer.put(block)))
    writer.close()
    return
  }

  const { writer, out } = await CarWriter.create([root])
  Readable.from(out).pipe(createWriteStream(argv.export))

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
  const { query, getBlock, cid, close } = await fromURI(argv.uri, readOnly, null, argv.decrypt)
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
  if (!store) store = await getStore(argv)
  let input
  if (isHttpUrl(argv.input)) {
    input = await httpGetString(argv.input)
  } else {
    input = readFileSync(argv.input).toString()
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

const runCreate = async argv => {
  let db = Database.create()
  const iter = db.sql(argv.sql, { ...mkopts() })
  const store = inmem()
  let last
  for await (const block of iter) {
    await store.put(block)
    last = block
  }
  const opts = { get: store.get, put: readOnly, ...mkopts() }
  db = await IPSQL.from(last.cid, opts)
  if (argv.export) {
    /* Note that we can't just use the list of blocks that were emitted because
    *  in the future when we support sequential queries (CREATE followed by subsequent
    *  INSERT statements) some of the blocks will be orphaned, so we need to ask
    *  the final database for all the cids in its graph
    */
    const cids = await db.cids()
    await runExport({ argv, cids, root: db.cid, store })
  }
  console.log(db.cid.toString())
}

const runWrite = async argv => {
  const store = argv.store ? await getStore(argv.store) : inmem()
  const patch = new Set()
  const put = async block => {
    await store.put(block)
    patch.add(block.cid.toString())
    store.put(block)
  }
  const { database } = await fromURI(argv.uri, put, store)
  let db = await database()
  db = await db.write(argv.sql)

  if (argv.patch) {
    if (!argv.export) throw new Error('Must supply export argument w/ patch option')
    await runExport({ argv, cids: patch, root: db.cid, store })
  } else if (argv.export) {
    /* Note that we can't just use the list of blocks that were emitted because
    *  in the future when we support sequential queries (CREATE followed by subsequent
    *  INSERT statements) some of the blocks will be orphaned, so we need to ask
    *  the final database for all the cids in its graph
    */
    const cids = await db.cids()
    await runExport({ argv, cids, root: db.cid, store })
  }
  console.log(db.cid.toString())
}

const exportOptions = yargs => {
  yargs.positional('output', {
    describe: 'File to export to. File extension selects export type'
  })
  yargs.option('query', {
    describe: 'SQL query to export rather than full database'
  })
}

const keygenOptions = yargs => {
  yargs.positional('output', { describe: 'Output filename' })
  yargs.option('keysize', { describe: 'Size of key in bytes', default: 32 })
}

const runRandomKeygen = async argv => {
  const bytes = randomBytes(argv.keysize)
  writeFileSync(argv.output, bytes)
}

const y = yargs(hideBin(process.argv))
  .command('query <uri> <sql>', 'Run IPSQL query', queryOptions, runQuery)
  .command('repl <uri>', 'Run local REPL', queryOptions, runRepl)
  .command('create <sql>', 'Create a new database', yargs => {
    sqlOptions(yargs)
  }, runCreate)
  .command('write <uri> <sql>', 'Mutate an existing SQL database', yargs => {
    uriOptions(yargs)
    sqlOptions(yargs)
    yargs.option('patch', {
      describe: 'Export only new blocks',
      type: 'boolean',
      default: false
    })
  }, runWrite)
  .command('import <subcommand>', 'Import CSV files', yargs => {
    yargs.command('export <input> <output>', 'Export blocks', yargs => {
      importOptions(yargs)
      exportOptions(yargs)
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
  .command('keygen <subcommand>', 'Generate keys for encryption', yargs => {
    yargs.command('random <output>', 'Generate a key from random bytes', keygenOptions, runRandomKeygen)
  }, () => y.showHelp())

export default y

if (y.argv._.length === 0) y.showHelp()
