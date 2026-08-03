import SvgIconProp from './SvgIconProp.astro';
import StarIcon from '../../assets/icons/star.svg';

export default {
  title: 'Astro/SvgIconProp',
  component: SvgIconProp,
  parameters: {
    docs: {
      description: {
        component: 'Regression test for issue #154 — passing an imported `.svg` file as a story arg so it renders as an inline `SvgComponent`, not just image metadata.',
      },
    },
  },
};

export const Default = {
  args: {
    label: 'Starred',
    Icon: StarIcon,
  },
};
