/** Lives in its own module so the story also shows that the script's imports were bundled. */
export function markAsRun(element: Element | null): void {
  if (element) {
    element.textContent = 'The component script ran.';
  }
}
