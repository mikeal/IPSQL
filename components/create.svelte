<script>
  import IPSQL from '../src/stores/inmemory.js'
  import { encode } from '../src/utils.js'
  import { CID } from 'multiformats'
  import Proof from './proof.svelte'
  let ipsql = IPSQL.headless()
  let edit = true
  let input
  let proof
  export let db = null
  export let sql = ''
  export let createSelector
  let error = null
  let _run = async () => {
    error = null
    if (typeof db === 'string') {
      db = CID.parse(db)
    }
    input = await encode({ sql, db })
    proof = await ipsql.transaction(input)
    edit = false
  }
  let run = async () => {
    try {
      await _run()
    } catch (e) {
      error = e
    }
  }
  $: dbcolor = db ? 'black' : 'grey'
  if (sql.length) run()
  console.log({db})
</script>

<style>
.database {
  color: var(--color);
}
error {
  color: red;
  font-weight: bold;
}
</style>

<create class={$$props.class}>
  <db-ref>db: <span class="database" style="--color: {dbcolor}">{db}</span></db-ref>
  {#if edit}
    <sql-statement>sql: <input type="text" bind:value={sql}/>
      <button on:click={run}>run</button>
    </sql-statement>
    {#if error}
      <error>
        <h3>{error.message}</h3>
        <pre>{error.stack}</pre>
      </error>
    {/if}
  {/if}
  {#if !edit}
  <sql-statement>sql: {sql}</sql-statement>
  <create-input>
    <p>INPUT:</p>
    <input-address>input: {input.cid.toString()}</input-address>
  </create-input>
  <create-output>
    <p>OUTPUT:</p>
    <Proof proof={proof} ipsql={ipsql} createSelector={createSelector}/>
  </create-output>
  {/if}
</create>
