import PublicImage from "./PublicImage.astro";

// A public/ image rendered via astro:assets <Image>. Guards that the static
// build rewrites its prerendered `/@fs/.../public/images/sample.png` URL to the
// served `/images/sample.png` path instead of leaving a broken dev URL.
export default {
  title: "Astro/PublicImage",
  component: PublicImage,
};

export const Default = {
  args: { src: "/images/sample.png", alt: "Sample public image" },
};
