// Vite re-evaluates edited server modules during development. What is created through here survives that, so a task
// still running in the old module instance never works on, or saves, a stale copy of the state.
const registry = ((globalThis as { __verifireSingletons?: Map<string, unknown> }).__verifireSingletons ??= new Map());

export const singleton = <T>(key: string, create: () => T): T => {
  if (!registry.has(key)) registry.set(key, create());
  return registry.get(key) as T;
};
