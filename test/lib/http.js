/* globals describe, before, after */
import { createServer } from 'http'

export default (name, handler, tests) => {
  const getPort = () => Math.floor(Math.random() * (9000 - 8000) + 8000)

  describe(`${name} http`, () => {
    const port = getPort()
    const server = createServer(handler)
    const closed = new Promise(resolve => server.once('close', resolve))
    before(() => new Promise((resolve, reject) => {
      server.listen(port, e => {
        if (e) return reject(e)
        resolve()
      })
    }))
    tests(port)
    after(() => {
      server.close()
      return closed
    })
  })
}
