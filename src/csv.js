import Papa from 'papaparse'
import IPSQL from './index.js'

const defaults = { header: true, dynamicTyping: true }

const isInt = n => n % 1 === 0

const main = ({ input, db, get, put, tableName, cache, chunker }) => {
  return new Promise((resolve, reject) => {
    const complete = async results => {
      const { data, meta } = results
      const types = {}
      const sizes = {}
      for (const row of data) {
        for (const [key, value] of Object.entries(row)) {
          if (value === null) continue
          if (typeof value === 'string') {
            if (value.length) {
              sizes[key] = value.length > (sizes[key] || 0) ? value.length : sizes[key]
              types[key] = 'string'
            }
          } else if (typeof value === 'number') {
            if (!isInt(value)) types[key] = 'float'
            else if (types[key] !== 'float') types[key] = 'int'
          } else if (typeof value === 'boolean') {
            if (!types[key]) types[key] = 'boolean'
          } else {
            throw new Error('Unexpected type')
          }
        }
      }
      const columns = []
      const skips = new Set()
      for (const column of meta.fields) {
        if (types[column] === 'string') columns.push(`\`${column}\` VARCHAR(${sizes[column]})`)
        if (types[column] === 'int') columns.push(`\`${column}\` INTEGER`)
        if (types[column] === 'float') columns.push(`\`${column}\` FLOAT`)
        if (types[column] === 'boolean') columns.push(`\`${column}\` INTEGER`)
        if (!types[column]) skips.add(column)
      }
      let sql = `CREATE TABLE \`${tableName}\` (\n${columns.map(c => '  ' + c).join(',\n')}\n)`
      console.log(sql)
      let db = await IPSQL.create(sql, { get, put, chunker, cache })

      // hack: this fixes an apparent bug in papaparse
      const fix = () => {
        const row = data[data.length - 1]
        for (const value of Object.values(row)) {
          if (value) return
        }
        data.pop()
      }
      fix()

      sql = `INSERT INTO \`${tableName}\` VALUES ${data.map(row => {
        const ret = []
        const _columns = [...columns]
        for (const column of meta.fields) {
          if (skips.has(column)) continue
          let value = row[column]
          const c = _columns.shift()
          if (typeof value === 'number' && !c.endsWith('INTEGER') && !c.endsWith('FLOAT')) {
            value = value.toString()
          }
          if (typeof value !== 'number' && (c.endsWith('INTEGER') || c.endsWith('FLOAT')) && value !== null) {
            throw new Error(`Not a number ${ JSON.stringify(value) }`)
          }
          if (value === 'NULL') value = null

          if (value === null) ret.push('NULL')
          else ret.push(JSON.stringify(value))
        }
        return `( ${ret.join(', ')} )`
      }).join(', ')}`

      db = await db.write(sql)
      resolve(db)
    }
    const options = { ...defaults, complete }
    Papa.parse(input, options)
  })
}

export default main
