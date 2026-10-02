import DateStamp from "./DateStamp.astro";

// Guards the Date-arg pipeline end-to-end: a real Date must survive serialize →
// transport (dev) / direct args (static build) → reconstruct → image-metadata →
// revive → sanitize without being flattened to {}.
export default {
  title: "Astro/DateStamp",
  component: DateStamp,
};

export const Default = {
  args: { publishedAt: new Date("2022-04-04T05:00:00.000Z") },
};

export const NestedInObject = {
  args: { publishedAt: new Date("2030-12-25T00:00:00.000Z") },
};
