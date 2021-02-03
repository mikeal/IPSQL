# SQL Proofs

SQL Proofs are immutable hash linked data structures for transactions
in a decentralized system.

They are a primitive we can use to build an efficient ACID compliant database
that supports all of SQL along with any number of extensions.

## Basics

A SQL Proof is a functional transform from one hash link graph to another.
The same version of the proof engine will always produce the same output given the same input and since the input is immutable the output is fully deterministic.

For hash addreses we use a [`CID`](https://specs.ipld.io/block-layer/CID.html), which is an efficient binary address format for any
hash algorithm and data format.

```js
// INPUT
CID({
  db: CID(database_address),
  sql: 'CREATE TABLE myTable'
})

// OUTPUT
CID({
  result: CID( result_address ),
  reads:  CID( CIDSet(...read_addresses) ),
  writes: CID( CIDSet(...write_addresses) ),
  db:     CID( database_address )
})
```

The same data structure is used for SQL write statements and SQL read statements. The `db`
address will be the same as the input for reads and the `result` will be `null` for writes.

A few things to note before we move on:

* The data structure used for `reads` and `writes` is a `CIDSet()` which is designed
  for comparison operations that produce deltas.
* While these are all hash linked graphs, the proof makes it unnecessary to do any traversals
  outside of the `CIDSet()s` to flush the transaction to disc, transfer it between nodes or processes,
  cache it in memory or locally for offline reads, etc.

A write transaction in any database creates a data structure that can be persisted and
queried later on. In this, it reduces the computation and IO necessary to perform the intended
search operations.

A SQL proof is a data structure that reduces the computation and IO necessary to provide
ACID guarantees in decentalized systems.

Since every state is immutable a read interface is trivial to provide against every state.

Nodes can sync deltas between any operation and even share their cache state in order to receive
deltas.

## ACID

A brief summary of ACID properties.

* Atomicity
  * Statement(s) either succeed or fail as one. In other words, partial state that is built
    in the middle of a transaction is never committed.
* Consistency
  * All data written is valid and future writes are guaranteed not to overwrite or otherwise
    corrupt previously written data.
* Isolation
  * Conccurent operations must produce the same result as if they had been run sequentially.
* Durability
  * Once a transaction is committed it will remain available in the future.

Since SQL proofs are complete immutable state references we know they're atomic. The final
hash address can't even be computed until all of the underlying data structure has been built,
therefor it can never even *be* committed until it is complete.

Since these data structures are a collection of hashed binary blocks we have great integrity
checks to protect against consistency issues.

The deterministic btrees we use have lock-free threaded mutations for all of our write operations.
Since they are a one-way function transform SQL proofs can also be merged together in concurrent
pairs like a CRDT.

## Separating concerns

Write transaction interfaces in IPSQL build a SQL Proof, aquire the desired persistence guarantees,
and update the desired mutex(es) with the latest proof.

This creates a separation between **Storage** and **Mutex** that makes them composable.

Since our transactions are a collection of hashed binary block addresses we can store them anywhere.
This means we can decentralize the storage layer. Blocks can come from *anywhere* which makes offline
and caching trivial. But this also means that our transaction doesn't *include* a persistence
guarantee. Instead, a SQL proof is what is used for a transaction to aquire a peristence guarantee
from a storage layer (and keep in mind that we can send deltas for any exchange of data).

As a database changes over time we need to know what its current state is. Managing locks
between state changes is the role of a mutex. The mutex tells us what the current state is
and accepts new updates to the current state that it will reconcile.

A SQL proof represents a change from one state to another, so it can be used by a mutex to
represent the current state but it doesn't inherently represent a notion of "current" and the
notion itself is problematic in decentralized and even distributed sytems. The means
by which a database is considered "HEAD" is out of scope of the proofs but the proofs are designed
to be efficiently merged by a mutex. Since we know a mutex will need to reconcile concurrent transactions
these proofs are designed to produce data structures that can be easily commuted.

## Deterministic B-Trees

For a complete description of the tree design you can read [this post](https://0fps.net/2020/12/19/peer-to-peer-ordered-search-indexes/) by Mikola Lysenko. TLDR; B-Trees tends to suffer from hystersis which makes them
non-derministic and therefor rather problemtic in hash linked data structures.

Our deterministic b-trees have a numbers of features that are important to keep in mind:

* The tree is self-balanced, we never need to compact it on order to gain efficiency.
* We can tune the probability of splits in the chunker in order to produce an average block
  size of whatever we desire. We can even adjust the target size as build branches up from the
  leaves if we want to reduce blocks sizes at the top of the tree in order to reduce mutation costs.
* The tree supports lock-free threaded mutatations so it can be updated concurrently. This means
  we gain tremendous efficiency the more we can bulk data into larger transactions.
* Unlike a HAMT there isn't a fixed branching factor so the tree depth scales dynamically with
  the size of the tree.
* Append-only work loads can create trees concurrently and then stitch them together with
  very little computation or churn.

We use these trees for several data structures in SQL proofs:

* CIDSet()
* OrderedMap()
  * SparseArray()
  * DBIndex()

### CIDSet()

We use unordered Sets of CIDs through the proofs to represent a collection of block addresses.

Since these are hash trees they are well designed for comparison since we can tell if any branch in
the tree matches by checking its hash. This works well in large sets that don't contain many differences
but once there is more than (1 / branching factor) there likely won't be any successful branch
matches.

While the actual implementation of CIDSet() stores block addresses in byte order the data structure
is representationally unordered since block addresses have the secure randomness of their hashing
function. And since addresses are forced into the byte sort order they don't leak any information
about the insertion order (which is important for later encryption use cases).

An incomplete list of use cases for CIDSets is:

* `read` and `write` block address lists in proofs.
* A proof for the SQL query `"TRACE"` ~~~will~~~ (WIP) produce a proof
  with all the blocks in the current database. Useful for block store GC.
* A node can produce CIDSet() for its current local cache.
  * Browser clients can produce a hash reference to their entire local offline
    cache that can be use to produce deltas in replication requests.
  * Processes or even clusters in a distributed system can maintain their local cache in an in-memory
    CIDSet() managed by an LRU which can be used to produce deltas for any request
    they send to another node.
* CIDSets can be commuted together concurrently once they are sorted.
  * You can trace a version log or replication log back to a prior state sync state
    and quickly get all potential data necessary to play the log or verify the proof.
  * If our cache states are represented by CIDSets then we can quickly produce a CIDSet
    of our total cache by commuting them.
* We can encrypt the block addresses in a CIDSet() and share it with an untrusted party.
  * This gives the recipient a state reference they can store and share with a key holder
    that the key holder can use while the recipient can't see any private data.
* We can encrypt the blocks themselves and we have a tree we can use for replication with
  storage providers we trust to see our read/write frequence but do not trust wish to
  show our data.

### OrderedMap

This is an abstract ordered map we use primarily as a base data structure for SparseArray
and DBIndex.

* Keys are ordered by a pre-defined sort order.
* Keys cannot repeat, not duplicate keys in the map.

#### SparseArray

We use a SparseArray for rows in our SQL tables. It's just an OrderedMap with integers for
keys and an append interface.

Since this is implemented on our deterministic b-tree we can take any appends
to the tree, process them concurrently, and then stick the trees together.
We can also commute [completed appends together](https://github.com/mikeal/chunky-trees/issues/1) (WIP)
using a similar technique.

The value is a `CID` for the address of the row.

#### DBIndex

A DBIndex is an OrderedMap with a compound key of `[ AnyValue, row_id ]`.

The value is a `CID` for the addres of the row.
