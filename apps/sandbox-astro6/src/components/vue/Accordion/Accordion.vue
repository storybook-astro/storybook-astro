<template>
  <div
    data-testid="vue-accordion"
    class="accordion"
  >
    <div
      v-for="(item, index) in items"
      :key="index"
      class="accordion-item"
    >
      <button
        class="accordion-header"
        :aria-expanded="isOpen(index)"
        @click="toggleItem(index)"
      >
        {{ item.title }}
        <span class="accordion-icon">
          {{ isOpen(index) ? '-' : '+' }}
        </span>
      </button>
      <div
        v-if="isOpen(index)"
        class="accordion-content"
      >
        {{ item.content }}
      </div>
    </div>
  </div>
</template>

<script>
import { ref } from 'vue';

export default {
  name: 'AccordionComponent',
  props: {
    items: {
      type: Array,
      default: () => []
    },
    allowMultiple: {
      type: Boolean,
      default: false
    }
  },
  setup(props) {
    const openIndexes = ref([]);

    const toggleItem = (index) => {
      if (props.allowMultiple) {
        const idx = openIndexes.value.indexOf(index);

        if (idx > -1) {
          openIndexes.value.splice(idx, 1);
        } else {
          openIndexes.value.push(index);
        }
      } else {
        openIndexes.value = openIndexes.value.includes(index) ? [] : [index];
      }
    };

    const isOpen = (index) => {
      return openIndexes.value.includes(index);
    };

    return {
      openIndexes,
      toggleItem,
      isOpen
    };
  }
};
</script>

<style scoped>
.accordion {
  border: 1px solid #30363d;
  border-radius: 8px;
  overflow: hidden;
}
.accordion-item {
  border-bottom: 1px solid #30363d;
}
.accordion-item:last-child {
  border-bottom: none;
}
.accordion-header {
  width: 100%;
  padding: 1rem;
  background: #21262d;
  border: none;
  text-align: left;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 1rem;
  font-weight: 500;
  color: #c9d1d9;
  transition: background 0.2s;
}
.accordion-header:hover {
  background: #292e36;
}
.accordion-icon {
  font-size: 1.25rem;
  font-weight: bold;
  color: #8b949e;
}
.accordion-content {
  padding: 1rem;
  background: #161b22;
  color: #c9d1d9;
}
</style>

