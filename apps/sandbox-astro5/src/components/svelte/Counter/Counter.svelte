<script lang="ts">
  let count = $state(1);

  function increment() {
    count += 1;
  }
</script>

<div data-testid="svelte-counter">
  <span>Svelte counter: {count}</span>
  <button onclick={increment}>+1</button>
</div>
