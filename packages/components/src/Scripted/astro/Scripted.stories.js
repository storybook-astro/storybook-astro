import Scripted from './Scripted.astro';

export default {
  title: 'Astro/Scripted',
  component: Scripted,
  parameters: {
    docs: {
      description: {
        component:
          'A processed `<script>` that imports a helper module. Static builds bundle the script with the preview, so it runs there as it does in dev.'
      }
    }
  }
};

export const Default = {};
