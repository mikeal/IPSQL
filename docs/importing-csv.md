# How to import CSV files into IPSQL

This documentation uses the open data CSV file for the ["Roots of Imperial Trade."](https://www.wnvermeulen.com/empires/)

## Importing

You don't *just* import a CSV file into IPSQL. The import command processes the CSV into blocks
which it can then serve to the network, write to storage, export to block archive formats, export
a diff of the new data as compared to a input store, and even offer in a REPL for testing.

CSV imports are always written as regular SQL tables (not DAG tables) with column types inferred from
the input data and all columns nullable.

```
```

## Import and Serve

If you want to expose the database you've just imported on a TCP port
you can use this option. IPSQL clients can now query the database remotely.

Note: the protocol IPSQL currently uses is a custom TCP protocol that will eventually
be replaced by a better p2p protocol.

```
$ ipsql import serve empire.csv
importing...
CREATE TABLE `empires.csv` (`empire` VARCHAR(30), `empire_start` INTEGER, `empire_end` INTEGER, `god` INTEGER, `king` INTEGER, `coin` INTEGER, `trade` VARCHAR(4), `country_name` VARCHAR(32), `country_iso` VARCHAR(3), `geo` VARCHAR(8), `begin` INTEGER, `end` INTEGER, `capital` INTEGER)
tcp://45.14.71.183:42597/bafyreigdp3e2kkovjpky2sy7nq3qhwrkifk7a2ve7gk7zgvpyzmncwiwoa
```

The generated SQL for `CREATE` is printed so that you can see the schema.

The last line is a url you can use in the `ipsql` cli to query this database remotely.

```
$ ipsql query tcp://45.14.71.183:42597/bafyreigdp3e2kkovjpky2sy7nq3qhwrkifk7a2ve7gk7zgvpyzmncwiwoa 'SELECT empire from `empires.csv` WHERE country_name = "Egypt"'
"Achaemenid Empire"
"Ayyubid Dynasty"
"British Empire"
"Byzantine Empire"
"Egyptian Empire"
"Fatimid Caliphate"
"Great Seljuq Empire"
"Macedonian Empire"
"Mamluk Sultanate"
"NeoAssyrian Empire"
"NeoBabylonian Empire"
"Ottoman Empire"
"Palmyrene Empire"
"Ptolemaic Empire"
"Rashidun Caliphate"
"Roman Empire"
"Sassanid Dynasty"
"Umayyad Caliphate"
"Kingdom of Kush "
"Abbasid Empire"
"Nabataean Kingdom "
```

## Import and REPL

You can also start the REPL to inspect and query the imported database.

```
$ ipsql import repl empires.csv
CREATE TABLE `empires.csv` (`empire` VARCHAR(30), `empire_start` INTEGER, `empire_end` INTEGER, `god` INTEGER, `king` INTEGER, `coin` INTEGER, `trade` VARCHAR(4), `country_name` VARCHAR(32), `country_iso` VARCHAR(3), `geo` VARCHAR(8), `begin` INTEGER, `end` INTEGER, `capital` INTEGER)
> query 'SELECT empire from `empires.csv` WHERE country_name = "Egypt"'
[
  [ 'Achaemenid Empire' ],
  [ 'Ayyubid Dynasty' ],
  [ 'British Empire' ],
  [ 'Byzantine Empire' ],
  [ 'Egyptian Empire' ],
  [ 'Fatimid Caliphate' ],
  [ 'Great Seljuq Empire' ],
  [ 'Macedonian Empire' ],
  [ 'Mamluk Sultanate' ],
  [ 'NeoAssyrian Empire' ],
  [ 'NeoBabylonian Empire' ],
  [ 'Ottoman Empire' ],
  [ 'Palmyrene Empire' ],
  [ 'Ptolemaic Empire' ],
  [ 'Rashidun Caliphate' ],
  [ 'Roman Empire' ],
  [ 'Sassanid Dynasty' ],
  [ 'Umayyad Caliphate' ],
  [ 'Kingdom of Kush ' ],
  [ 'Abbasid Empire' ],
  [ 'Nabataean Kingdom ' ]
]
>
```

## Import and Export
