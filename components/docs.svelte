<script>
  import Create from './create.svelte'
</script>

<style>
ipsql-docs {
  width: vw;
  font-size: 150%;
  display: flex;
  flex-direction: column;
}
sep {
  margin-bottom: 30px;
}
ipsql-docs :global(.doc-container) {
  display: flex;
  flex-direction: column;
  border: grey solid 10px;
  padding: 5px 5px 5px 5px;
  background-color: #E8E8E8;
}
</style>

<ipsql-docs>
  <Create class="doc-container" createSelector="ipsql-docs" />
  <sep />
  <Create class="doc-container" createSelector="ipsql-docs" sql="CREATE TABLE test (id INT)"/>
  <sep />
</ipsql-docs>
