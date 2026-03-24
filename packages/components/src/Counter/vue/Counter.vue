<template>
  <div data-testid="vue-counter">
    <span>Vue counter: {{ count }}</span>
    {{ ' ' }}
    <button @click="increment">
      +1
    </button>
  </div>
</template>

<script>
import { ref } from 'vue';

export default {
  name: 'CounterComponent',
  setup() {
    const count = ref(1);

    const increment = () => {
      count.value += 1;
    };

    return {
      count,
      increment
    };
  }
};
</script>
