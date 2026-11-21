// Shared by the build (which writes the render app's files) and the runtime
// (which runs inside it), so it must not import either side.

/** The `locals` key a render page reads its render request from. */
export const RENDER_REQUEST_LOCAL = 'storybookAstroRenderRequest';

/** Which generated render page renders a story, by story id and by component. */
export type RenderPages = {
  stories: Record<string, string>;
  components: Record<string, string>;
};
