// Custom Alpine entrypoint for Storybook
// This prevents Alpine from auto-starting on DOMContentLoaded
// since Storybook manages the initialization lifecycle
export default function setup(Alpine) {
  // Prevent the DOMContentLoaded listener from calling Alpine.start()
  // by marking Alpine as already started
  // The Storybook renderer will handle starting Alpine when needed
  const originalStart = Alpine.start.bind(Alpine);
  let hasStarted = false;
  
  Alpine.start = function() {
    if (!hasStarted) {
      hasStarted = true;
      originalStart();
    }
  };
  
  // Expose started state for the renderer to check
  Object.defineProperty(Alpine, '_isStarted', {
    get() { return hasStarted; }
  });
}
