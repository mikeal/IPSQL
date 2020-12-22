#!/usr/bin/env node
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import IPSQL from '../src/index.js'
import { bf } from 'chunky-trees/utils'
import cache from '../src/cache.js'
import ipfs from './ipfs.js'
import { CID } from 'multiformats'
import csv from '../src/csv.js'
import fs from 'fs'

const chunker = bf(256)

const ipfsOptions = yargs => {
  yargs.option('tmp', {
    describe: 'Use an ephemoral in-memory IPFS instance',
    type: 'boolean',
    default: false
  })
  yargs.option('serve', {
    describe: 'Continue running IPFS instance',
    default: false,
  })
}

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
  ipfsOptions(yargs)
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
  ipfsOptions(yargs)
}

const mkopts = async argv => ({ ipfs: await ipfs(argv), cache: cache(), chunker })

const getDatabase = async (argv, cid=null) => {
  const opts = await mkopts(argv)
  if (typeof cid === 'string') cid = CID.parse(cid)
  const db = await IPSQL.from(cid, opts)
  return db
}

const run = async argv => {
  const db = await getDatabase(argv, argv.cid)
  const results = await db.read(argv.sql)
  console.log(JSON.stringify(results, null, 2))
}

const runImport = async argv => {
  const input = fs.readFileSync(argv.file).toString()
  const opts = await mkopts(argv)
  if (argv.database) opts.db = await getDatabase(argv, argv.database)
  const db = await csv({ ...argv, ...opts, input })
  if (!db.serve) await opts.ipfs.stop()
  console.log(db.cid.toString())
}

yargs(hideBin(process.argv))
  .command('$0 <cid> <sql>', 'Run IPSQL query', options, run)
  .command('import <file>', 'Import CSV file into IPFS table', importOptions, runImport)
  .argv
