import ImportedStylesCard from './ImportedStylesCard.astro';

// Astro 7.4+ names CSS Module classes in dev by hashing the file path. This
// story checks that the stylesheet shipped with the story uses the same names
// as the markup (issue #223).
export default {
  title: 'Astro/Imported Stylesheets',
  component: ImportedStylesCard,
};

export const FrontmatterImports = {};
