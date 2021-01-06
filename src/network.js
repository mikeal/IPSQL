import znode from 'znode'
import net from 'net'
import IPSQL from './index.js'
import { CID } from 'multiformats'

const mkrpc = ({store, socket, chunker, cache}) => {
  let remote
  const rpc = {
    version: 'v0',
    query: async (cid, q) => {
      const db = await IPSQL.from(CID.parse(cid), { ...store, chunker, cache })
      return db.read(q, true)
    },
    getBlock: async (cid) => {
      if (typeof cid === 'string') cid = CID.parse(cid)
      const { bytes } = await store.get(cid)
      return bytes
    },
    address: () => socket.remoteAddress + ':' + socket.remotePort
  }
  remote = znode(socket, rpc)
  return { ...rpc, remote }
}

const create = (opts) => {
  const connections = {}
  const add = rpc => {
    connections[rpc.address()] = rpc
  }
  const getConnection = (port, host) => {
    if (!host) host = '127.0.0.1'
    const address = host + ':' + port
    return connections[address]
  }

  const server = net.createServer(async socket => add(mkrpc({ ...opts, socket })))
  const client = async (...address) => {
    const cached = getConnection(...address)
    if (cached) return cached.remote

    const socket = net.connect(...address)
    const rpc = mkrpc({ ...opts, socket })
    add(rpc)
    const close = () => new Promise(resolve => {
      socket.on('close', resolve)
      socket.end()
    })
    return { ...await rpc.remote, close }
  }
  const listen = (...args) => new Promise(resolve => server.listen(...args, resolve))
  return { client, server, connections, listen }
}

export default create

