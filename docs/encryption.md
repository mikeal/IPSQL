# Database Encryption and Decryption

IPSQL uses a simple single layer of encryption at the block level with a single
secret key.

Many different advanced encryption workflows can be built on top of this and handled
in layers above IPSQL.

## How it works

Any database state can be described as a list of blocks with a root node. Any query
can be described as a subset of those blocks with the same root node. These are sometimes
described as "proofs" or "merkle proofs."

IPSQL encryption encrypts each block atomically. This means that the links inside each block
link to the unencrypted, rather than the encrypted, block addresses.

After the blocks are encrypted an unencrypted graph is created that links to all the encrypted
blocks that is ordered by block address. A final unencrypted block is created that links to this graph along
with a reference to the encrypted block for the root of the original graph. This final block is
the "encrypted root" that is printed and noted in exported car files.

This means that:
  * The shape of the graph cannot be easily determined by the encrypted blocks since
    their ordering is unknown.
  * The graph produced by encrypted can be pinned in IPFS or stored in Filecoin since
    all the encrypted data is linked into a single graph that is unencrypted.
  * There is no way to read or query an IPSQL database until **the entire encrypted
    proof is decrypted into a block store.**

Since the links in the database graph are to the unencrypted blocks, all blocks for a given
operation must already be decrypted and available in a block store. There's no way to map
between a unencrypted block address and encrypted block address, so the entire proof must
be decrypted before attempted any read operations on the database.

Users must be mindful not to leak unencrypted blocks. While it's perfectly reasonable to
load an encrypted .car file into IPFS and share it with a network, decrypted a database into
an IPFS node would expose the entire private database to the network without encryption.

## Encryption keys

Encrypted blocks are simply AES-GCM encrypted bytes along with an IV (Initializing Vector).
The block is encrypted with a shared secret of either 16 or 32 bytes (128bit or 256bit key).

The `--encrypt` and `--decrypt` options take a file as input. The bytes in this file are used
as the shared secret. It's your responsibility to generate secure shared secrets and to manage
how they are shared between users.

You can use the CLI to generate a shared secret keyfile from a secure random byte generator.

```
ipjs keygen random test.key
```

If you're using public key encryption you can derive a shared secret using the private and
public keys, depending on the type of public key encryption you're using.

## What about two layer encryption and "replication keys"

There are more advanced encryption workflows in Textile, SSB, and many other projects and protocol
that will wrap graphs in more than one layer of encryption. This is so that users can share a key
with a data provider that can replicate the data but not read it.

These workflows are great but are implemented in a layer above the default encryption in IPSQL. IPSQL
essentially provides the replicatable graph that can be shared with provider.
