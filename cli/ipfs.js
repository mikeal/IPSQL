import Repo from 'ipfs-repo'
import tempy from 'tempy'
import ipfs from 'ipfs'

const tmp = async () => {
  const dir = tempy.directory()
  const repo = new Repo(dir)
  return ipfs.create({ repo })
}

const create = argv => {
  if (argv.tmp) return tmp()
  return ipfs.create()
}

export default create
