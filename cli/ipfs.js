import ipfsModule from 'ipfs'
import Ctl from 'ipfsd-ctl'

const createIPFS = () => Ctl.createController({
  type: 'proc',
  ipfsModule,
  test: true,
  disposable: true
})

const tmp = async () => {
  const ipfsd = await createIPFS()
  /*
  if (ipfsd.api.stop) throw new Error('it is already set')
  ipfsd.api.stop = () => ipfsd.stop()
  */
  return ipfsd.api
}

const create = argv => {
  if (argv.tmp) return tmp()
  return ipfsModule.create()
}

export default create
