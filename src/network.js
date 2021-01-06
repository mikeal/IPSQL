import znode from 'znode'
import net from 'net'
import { CID } from 'multiformats'

const mkrpc = (store, socket) => {
  let remote
  const rpc = {
    version: 'v0',
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

const create = (store) => {
  const connections = {}
  const add = rpc => {
    connections[rpc.address()] = rpc
  }
  const getConnection = (port, host) => {
    if (!host) host = '127.0.0.1'
    const address = host + ':' + port
    return connections[address]
  }

  const server = net.createServer(async socket => add(mkrpc(store, socket)))
  const client = (...address) => {
    const cached = getConnection(...address)
    if (cached) return cached.remote

    const socket = net.connect(...address)
    const rpc = mkrpc(store, socket)
    add(rpc)
    return rpc.remote
  }
  const listen = (...args) => new Promise(resolve => server.listen(...args, resolve))
  return { client, server, connections, listen }
}

export default create

