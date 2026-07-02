import BoxParent from './BoxParent.astro';
import BoxChild from './BoxChild.astro';

// Exercises configured-component slots (issue #146): a child component placed in
// a parent's slot together with its own props and slot content, mixed freely
// with plain HTML. Passing the bare component reference (`default: BoxChild`)
// renders it with no props/slots; the `{ component, props, slots }` descriptor
// gives the child its own content.
export default {
  title: 'Astro/SlotBox',
  component: BoxParent,
};

// A single configured child with its own slot content.
export const ConfiguredChild = {
  args: {
    slots: {
      default: {
        component: BoxChild,
        props: { label: 'Child label' },
        slots: { default: '<p>Lorem ipsum dolor sit amet</p>' },
      },
    },
  },
};

// Plain HTML and a configured child mixed in the same slot.
export const MixedContent = {
  args: {
    slots: {
      default: [
        '<p>Before the child</p>',
        { component: BoxChild, slots: { default: '<p>Inside the child</p>' } },
        '<p>After the child</p>',
      ],
    },
  },
};
