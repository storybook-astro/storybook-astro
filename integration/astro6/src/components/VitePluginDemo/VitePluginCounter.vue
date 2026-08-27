<template>
  <button
    data-testid="vite-plugin-island"
    @click="clicks++"
  >
    {{ banner }} — clicks: {{ clicks }}
  </button>
</template>

<script setup>
import { ref } from 'vue';
import banner from 'virtual:project-banner';

const clicks = ref(0);

</script>
