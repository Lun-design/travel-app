import React from 'react';
import { vi } from 'vitest';

export type NodeProps = { children?: React.ReactNode; accessibilityLabel?: string; onPress?: () => unknown; onChangeText?: (value: string) => void; value?: string; disabled?: boolean; source?: { uri: string }; [key: string]: unknown };
export function nodes(node: React.ReactNode): React.ReactElement<NodeProps>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!React.isValidElement<NodeProps>(node)) return [];
  return [node, ...nodes(node.props.children), ...nodes(node.props.footer as React.ReactNode), ...nodes(node.props.notice as React.ReactNode)];
}
export function text(node: React.ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join(' ');
  if (React.isValidElement<NodeProps>(node)) return text(node.props.children);
  return typeof node === 'string' || typeof node === 'number' ? String(node) : '';
}
export function harness(renderComponent: () => React.ReactNode) {
  const states: unknown[] = [], refs: { current: unknown }[] = [];
  const effects: { deps?: React.DependencyList; cleanup?: () => void }[] = [];
  const memos: { deps?: React.DependencyList; value: unknown }[] = [];
  let s = 0, r = 0, e = 0, m = 0;
  let scheduled: (() => void)[] = [];
  vi.spyOn(React, 'useState').mockImplementation((initial?: unknown) => {
    const i = s++;
    if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial;
    return [states[i], (value: unknown) => { states[i] = typeof value === 'function' ? value(states[i]) : value; }] as ReturnType<typeof React.useState>;
  });
  vi.spyOn(React, 'useRef').mockImplementation((initial?: unknown) => refs[r++] ?? (refs[r - 1] = { current: initial }));
  const memo = (factory: () => unknown, deps?: React.DependencyList) => {
    const i = m++, previous = memos[i];
    if (previous && deps && previous.deps?.length === deps.length && deps.every((v, j) => Object.is(v, previous.deps?.[j]))) return previous.value;
    const value = factory(); memos[i] = { deps, value }; return value;
  };
  vi.spyOn(React, 'useMemo').mockImplementation(memo as typeof React.useMemo);
  vi.spyOn(React, 'useCallback').mockImplementation(((callback, deps) => memo(() => callback, deps)) as typeof React.useCallback);
  vi.spyOn(React, 'useEffect').mockImplementation((effect, deps) => {
    const i = e++, prev = effects[i];
    if (prev && deps && prev.deps?.length === deps.length && deps.every((v, j) => Object.is(v, prev.deps?.[j]))) return;
    scheduled.push(() => { prev?.cleanup?.(); const cleanup = effect(); effects[i] = { deps, cleanup: typeof cleanup === 'function' ? cleanup : undefined }; });
  });
  return { render() { s = r = e = m = 0; scheduled = []; const tree = renderComponent(); scheduled.forEach((run) => run()); return tree; }, unmount() { effects.forEach((v) => v.cleanup?.()); } };
}
export function press(tree: React.ReactNode, label: string) {
  const button = nodes(tree).find((n) => n.props.accessibilityLabel === label);
  if (!button?.props.onPress || button.props.disabled) throw new Error(`Unavailable button: ${label}`);
  return button.props.onPress();
}
