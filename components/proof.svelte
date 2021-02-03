<script>
  import { onMount } from 'svelte';
  import { CID } from 'multiformats'
  export let ipsql
  export let proof
  export let createSelector
  let loaded = false
  let error
  let CreateComponent
  if (typeof proof === 'string') {
    proof = CID.parse(proof)
  }
  if (proof.asCID === proof) {
    proof = ipsql.getBlock(proof)
    loaded = false
    proof
    .catch(e => { error = e })
    .then(p => {
      proof = p
      loaded = true
    })
  }
  onMount(async () => {
    CreateComponent = (await import('./create.svelte')).default
    if (!proof.then) {
      loaded = true
    }
  })
  const _create = (target) => {
    const c = new CreateComponent({
      target: document.querySelector(createSelector),
      props: {
        class: 'doc-container',
        createSelector,
        db: proof.value.db
      }
    })
  }
  async function create () {
    try {
      await _create(this)
    } catch (e) {
      error = e
    }
  }
</script>

<style>
proof {
  display: flex;
  flex-direction: column
}
error {
  color: red;
  font-weight: bold;
}
span.create-query {
  color: blue;
}
</style>

<proof>
  {#if error}
    <error>
      <h3>{error.message}</h3>
      <pre>{error.stack}</pre>
    </error>
  {/if}
  {#if loaded}
  <proof-address>proof: { proof.cid }</proof-address>
  <proof-reads>reads: { proof.value.reads }</proof-reads>
  <proof-writes>writes: { proof.value.writes }</proof-writes>
  <proof-database>db: { proof.value.db } <button on:click={create}>query</button></proof-database>
  {#if proof.value.result}
    <proof-result>result: { proof.value.result }</proof-result>
  {/if}
  {/if}
</proof>
