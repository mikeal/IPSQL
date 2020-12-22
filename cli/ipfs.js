import { Peer, BlockStore } from "@textile/ipfs-lite"
// Use any interface-datastore compliant store
import { MemoryDatastore } from "interface-datastore"
import Libp2p from "libp2p"
import KadDHT from "libp2p-kad-dht"
import TCP from "libp2p-tcp"
import MPLEX from "libp2p-mplex"
import noise from "libp2p-noise"

const { NOISE } = noise

const main = async argv => {
  // Bring your own libp2p host....
  const datastore = new BlockStore(new MemoryDatastore())
  const libp2Options = {
    datastore,
    addresses: {
      listen: ['/ip4/0.0.0.0/tcp/0']
    },
    modules: {
      transport: [ TCP ],
      streamMuxer: [ MPLEX ],
      connEncryption: [ NOISE ],
      // we add the DHT module that will enable Peer and Content Routing
      dht: KadDHT
    },
    config: {
      dht: {
        // dht must be enabled
        enabled: true
      }
    }
  }
  const node = await Libp2p.create(libp2Options)
  console.log(node)
  const lite = new Peer(datastore, node)

  console.log(lite)
  throw new Error('here')

  await lite.start()

  const cid = "QmWATWQ7fVPP2EFGu71UkfnqhYXDYH566qy47CnJDgvs8u"
  const data = await lite.getFile(cid)
  console.log(data.toString())
  // Hello World
  await lite.stop()
}

export default main
