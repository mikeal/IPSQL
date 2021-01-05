#!/usr/bin/env node
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import IPSQL from '../src/index.js'
import { bf } from 'chunky-trees/utils'
import cache from '../src/cache.js'
import { CID } from 'multiformats'
import csv from '../src/csv.js'
import fs from 'fs'

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

const run = async argv => {
  const db = await getDatabase(argv, argv.cid)
  const results = await db.read(argv.sql)
  console.log(JSON.stringify(results, null, 2))
}

const runImportExport = async argv => {
  const input = fs.readFileSync(argv.file).toString()
  const db = await csv({ ...argv, ...mkopts(), input })
}

const runImportServe = async argv => {
  const db = await csv({ ...argv, ...mkopts(), input })
  console.log('import serve')
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
