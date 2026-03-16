# Support Astro Components Referencing Other Astro Components

## Problem Statement

Currently, Storybook Astro cannot render stories where an Astro component references another Astro component (e.g., a Button component rendered inside a Link component). When users try to pass Astro components as props, the render pipeline treats them as plain functions rather than renderable components, resulting in server-side rendering failures or incorrect output.

The user example shows this pattern:

```javascript
render: (args) => {
  const icon = args.Icon ? <Icon icon={args.Icon} size={args.size} /> : null;
  return (
    <Link Icon={icon} {...args}>
      {args.default}
    </Link>
  );
}
```

## Current State

The framework processes args through `middleware.ts` where:

1. Args are sanitized and processed (image metadata conversion, etc.)
2. Props and slots are separated (slots extracted, rest become component props)
3. Components are rendered via Astro Container's `renderToString` method
4. Astro components passed as props are not currently detected or specially handled

The `render.tsx` renderer detects Astro components via `isAstroComponentFactory` flag, but this check only happens at the top level (in the `render()` function). Nested Astro components in props are not transformed into a renderable format.

## Proposed Solution

Implement a multi-layered approach to support component composition:

### 1. Arg Transformation (middleware.ts)

Add a pre-processing step that identifies Astro components in args and converts them to a serializable format that can be:

- Detected by the renderer
- Reconstructed into a valid component reference on the server
- Rendered via Astro Container without causing type errors

This involves:

- Creating an `AstroComponentReference` type to represent nested components
- Scanning args recursively for `isAstroComponentFactory` functions
- Storing moduleId and position information for each nested component
- Maintaining a mapping of serialized references for server-side reconstruction

### 2. Server-Side Reconstruction (middleware.ts)

When rendering, reconstruct Astro component references from the serialized data:

- Load the referenced component module
- Validate that it's a valid Astro component
- Pass the reconstructed component back to the Astro Container for rendering

### 3. Slot and JSX Handling (render.tsx)

Handle the different ways components can be passed:

- As props (e.g., `Icon={icon}`)
- As JSX elements in render functions (requires converting JSX to HTML strings)
- As part of composed components

### 4. Testing & Portable Stories Support (portable-stories.ts, testing/)

Ensure the testing API supports composed components by:

- Adding component composition detection in the test render function
- Providing utilities to handle Astro component references in test scenarios
- Documenting usage patterns for testing composed components

## Complexity Assessment

Medium-High complexity due to:

- Changes needed across multiple files (middleware, renderer, testing)
- Serialization/deserialization of component references
- Compatibility with existing arg handling (image metadata, sanitization)
- Both dev-mode (HMR) and build-time rendering support
- Testing and portable stories integration

## Risk Areas

- Circular component references (detecting and preventing infinite loops)
- Performance impact of recursive arg scanning on large arg objects
- Module loading and caching with nested components
- Ensuring Astro Container properly handles dynamically loaded components
- Maintaining HMR hot reloading with component references

## Implementation Strategy

### Phase 1: Core Dev Mode

- Implement arg transformation in middleware.ts
- Add component detection and serialization
- Test with basic nested component scenarios

### Phase 2: Renderer Integration

- Update render.tsx to handle component references
- Add support for JSX-like component composition
- Ensure proper error handling and fallbacks

### Phase 3: Static Builds

- Extend vitePluginAstroBuildPrerender.ts for nested components
- Handle module loading in build context
- Validate pre-rendered output

### Phase 4: Testing & Polish

- Add portable stories support
- Create test utilities and helpers
- Document patterns and limitations

## Success Criteria

- Users can pass Astro components as props in story args
- Nested components render correctly in both dev and static builds
- Circular references are detected and prevented
- Existing functionality (props, slots, images) remains unaffected
- Performance impact is minimal for typical component libraries
- Documentation clearly explains the pattern with examples
