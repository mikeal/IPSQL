class Missing {
  get statusCode () {
    return 404
  }
}

class MockS3 {
  constructor () {
    this.storage = {}
  }

  async _headObject (opts) {
    if (!this.storage[opts.Key]) throw new Missing('Not found')
    return { ContentLength: this.storage[opts.Key].length }
  }

  headObject (opts) {
    return { promise: () => this._headObject(opts) }
  }

  async _getObject (opts) {
    if (!this.storage[opts.Key]) throw new Missing('Not found')
    return { Body: this.storage[opts.Key] }
  }

  getObject (opts) {
    return { promise: () => this._getObject(opts) }
  }

  async _putObject (opts) {
    this.storage[opts.Key] = opts.Body
  }

  putObject (opts) {
    return { promise: () => this._putObject(opts) }
  }

  async _listObjectsV2 (opts) {
    const after = opts.StartAfter || ''
    const keys = Object.keys(this.storage).filter(s => {
      return s.startsWith(opts.Prefix) && s > after
    }).sort()
    return { Contents: keys.map(Key => ({ Key })) }
  }

  listObjectsV2 (opts) {
    return { promise: () => this._listObjectsV2(opts) }
  }
}

export default MockS3
