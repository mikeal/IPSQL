<script>
</script>

<svelte:options tag="ipsql-docs" />

<style>
  how {
    font-size: 150%;
  }
</style>

<how>
  <h1>How does IPSQL work?</h1>
  <p>IPSQL is quite different from traditional databases.</p>
  <p>A typical database will write to a file on a server you're running it on. But
  that doesn't work so well for building distributed systems.</p>
  <p>IPSQL produces <a href="https://specs.ipld.io/block-layer/block.html"><strong>blocks</strong></a>, which are just blobs of binary data
  that are then referenced by <a href="https://specs.ipld.io/block-layer/CID.html"><strong>hash address</strong></a>.</p>
  <p>This means that you can store IPSQL data anywhere. File systems, <a href="https://aws.amazon.com">S3</a>, <a href="https://specs.ipld.io/block-layer/content-addressable-archives.html">export files</a>, <a href="https://en.wikipedia.org/wiki/Content_delivery_network">CDN</a>, <a href="https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API">browser local storage</a>,
  p2p networks (<a href="https://ipfs.io">IPFS</a>), blockchains (<a href="https://filecoin.io">Filecoin</a>), can all be used to store and provide access to IPSQL databases. In fact, you can use any <strong>combination</strong> of these storage systems layered as you see fit.</p>
  <p>Since data is addressed by a <a href="https://en.wikipedia.org/wiki/Cryptographic_hash_function">cryptographic hash</a> we don't even need to trust the data provider since
  we can verify any data sent matches the hash in the address.</p>
  <p>Traditional SQL databases write "pages" to file formats on disc for each transaction. This gives you a guarantee when the transaction returns the data is safely on disc. These pages accumulate as you add
  more data and indexes to your database.</p>
  <p>IPSQL is a functional transformation that takes the hash address of a <strong>database</strong> and a <a href="https://www.w3schools.com/sql/sql_intro.asp"><strong>SQL statement</strong></a> as input and deterministically returns the <strong>hash address</strong> of a <strong>SQL proof</strong>.</p>
  <p>A <strong>SQL proof</strong> describes
  <ul>
    <li>the <strong>result</strong> of the SQL statement (if there is one, there won't be for most writes),</li>
    <li>a <a href="https://en.wikipedia.org/wiki/Set_(abstract_data_type)">Set</a> of hash addresses that must be <strong>read</strong> to perform the proof,</li>
    <li>a Set of <strong>new</strong> hash addresses written by the proof,</li>
    <li>and the hash address of the database after performing the proof.</li>
  </ul>
  <p>Rather than just returning the desired query result, we also know the block addresses required to verify
  the proof. This means we can have untrusted parties hold the large amounts of data necessary to perform
  arbitrary SQL queries. We then only need this small fraction of the database to verify the proof.
  </p>
  <p>We can also query databases and store their results in cache or offline.
  When the database changes in the future we can ask for a new proof of the same query. If the hashe of the
  read set has not changed then our query has not changed. If it has changed, or if we want to verify the proof,
  we can ask for the <strong>delta</strong> of blocks between the old proof and the new one.
  </p>
</how>
