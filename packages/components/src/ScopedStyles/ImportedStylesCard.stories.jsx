import ImportedStylesCard from './ImportedStylesCard.astro';

export default {
  title: 'Astro/Scoped Styles/Imported Stylesheets',
  component: ImportedStylesCard,
  parameters: {
    docs: {
      description: {
        component:
          'Stylesheets imported in the frontmatter ship with the story, as they do on an Astro page: the purple border comes from `ImportedStylesCard.css`, and the orange label from a CSS module.',
      },
    },
  },
};

export const FrontmatterImports = {};
