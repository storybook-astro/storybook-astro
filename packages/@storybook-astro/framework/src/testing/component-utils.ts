export function isStorybookAstroClientStub(component: unknown) {
  return (
    typeof component === 'function' &&
    String(component).includes('Astro components are rendered server-side by Storybook')
  );
}

export function isAstroComponentFactory(component: unknown) {
  return typeof component === 'function' && 'isAstroComponentFactory' in component;
}

export function getComponentModuleId(component: unknown) {
  if (typeof component !== 'function' || !('moduleId' in component)) {
    return null;
  }

  if (typeof component.moduleId !== 'string') {
    return null;
  }

  return component.moduleId.split('?')[0].split('#')[0];
}

export function getComponentModuleFilePath(component: unknown) {
  const moduleId = getComponentModuleId(component);

  if (!moduleId || !moduleId.startsWith('/')) {
    return null;
  }

  return moduleId;
}
