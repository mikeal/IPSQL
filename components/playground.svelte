<script>
  import Button, {Label} from '@smui/button'
  import Textfield from '@smui/textfield'
  import DataTable, {Head, Body, Row, Cell} from '@smui/data-table'
  import List, {Item, Text} from '@smui/list'
  import Create from './create.svelte'
  import IPSQL from '../src/stores/inmemory.js'
  let ipsql = IPSQL.headless()
  export let statements = [
    'CREATE TABLE playground (id INT, text: VARCHAR(256))',
    'INSERT INTO playground VALUES (10, "hello world"), (20, "world hello")',
    'SELECT * from playground'
  ]
  export let sqlStatement = ''
  let transactions = []
  let db = null
  let error
  const run = async () => {
    if (!statements.length) return
    const sql = statements.shift()
    const proof = await ipsql.transaction({ db, sql })
    let { writes } = proof.value
    if (writes && writes.length) writes = writes.length
    if (writes.asCID === writes) writes = (await ipsql.getBlock(writes)).value.length
    let result = null
    if (proof.value.result) {
      result = (await ipsql.getBlock(proof.value.result)).value
    }
    transactions.push({ sql, db, writes: writes ? writes : 0, result })
    transactions = transactions
    db = proof.value.db
    run().catch(e => { error = e })
  }
  run().catch(e => { error = e })
  let _runSQL = async () => {
    const sql = sqlStatement
    sqlStatement = ''
    statements.push(sql)
    return run()
  }
  let runSQL = () => {
    _runSQL().catch(e => { error = e })
  }
</script>

<style>
error {
  color: red;
  font-weight: bold;
}
</style>

<ipsql-docs>
  <DataTable table$aria-label="transactions">
    <Body>
    {#each transactions as trans}
      <Row>
        <Cell>{ trans.sql } on { trans.db ? trans.db.toString().slice(0, 12) + '...' : null }</Cell>
        <Cell>(BlockWrites: { trans.writes })</Cell>
      </Row>
      {#if trans.result}
      <Row>
        <DataTable table$aria-label="results">
          <Body>
            {#each trans.result as row}
            <Row>
              {#each row as column}
              <Cell>{ column }</Cell>
              {/each}
            </Row>
            {/each}
          </Body>
        </DataTable>
      </Row>
      {/if}
    {/each}
      <Row>
        <Cell>
          <Textfield bind:value={sqlStatement} label="Enter SQL Statement" />
        </Cell>
        <Cell>
          <Button on:click={runSQL}>
            <Label>Run</Label>
          </Button>
        </Cell>
      </Row>
    </Body>
  </DataTable>
  {#if error}
  <error>
    <h3>{error.message}</h3>
    <pre>{error.stack}</pre>
  </error>
  {/if}
</ipsql-docs>
