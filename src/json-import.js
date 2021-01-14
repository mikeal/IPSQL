import IPSQL from './index.js'

const main = async ({ traverse, input, get, put, columns, tableName: name, cache, chunker }) => {
  let parsed = JSON.parse(input)
  const opts = { get, put, chunker, cache }
  let ipsql = await IPSQL.create({ dt: { create: { name, columns } } }, opts)

  if (traverse) {
    const path = traverse.split('/').filter(x => x)
    while (path.length) {
      let key = path.shift()
      if (Array.isArray(parsed)) {
        key = parseInt(key)
      }
      parsed = parsed[key]
    }
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Imported JSON is not an array. Use --traverse to find a path to an array.')
  }
  ipsql = await ipsql.dt.insert(name, parsed)
  console.log(`Created ${name} ${ipsql.id}`)
  return ipsql
}

export default main
