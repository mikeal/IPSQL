import { PassThrough } from 'stream'

class Missing {
  get statusCode () {
    return 404
  }
}

class MockS3 {
  constructor () {
    this.storage = {}
  }

  async headObject (opts) {
    if (!this.storage[opts.Key]) throw new Missing('Not found')
    return { ContentLength: this.storage[opts.Key].length }
  }

  async getObject (opts) {
    if (!this.storage[opts.Key]) throw new Missing('Not found')
    const reader = new PassThrough()
    reader.end(this.storage[opts.Key])
    return { Body: reader }
  }

  async putObject (opts) {
    this.storage[opts.Key] = opts.Body
  }
}

export default MockS3
