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
    return { Body: this.storage[opts.Key] }
  }

  async putObject (opts) {
    this.storage[opts.Key] = opts.Body
  }
}

export default MockS3
