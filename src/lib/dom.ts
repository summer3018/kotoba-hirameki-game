/** 画面を組み立てるための小さな道具。フレームワークは使わない。 */

type Child = Node | string | number | null | undefined | false;

export interface Attrs {
  class?: string;
  text?: string;
  type?: string;
  value?: string;
  disabled?: boolean;
  hidden?: boolean;
  html?: string;
  onClick?: (ev: MouseEvent) => void;
  onInput?: (ev: Event) => void;
  [key: string]: unknown;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = String(value);
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'html') node.innerHTML = String(value);
    else if (key === 'onClick') node.addEventListener('click', value as EventListener);
    else if (key === 'onInput') node.addEventListener('input', value as EventListener);
    else if (key === 'disabled') (node as HTMLButtonElement).disabled = value === true;
    else if (key === 'hidden') node.hidden = value === true;
    else if (key === 'value') (node as HTMLInputElement).value = String(value);
    else node.setAttribute(key, String(value));
  }

  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** 画面の土台。ヘッダー・本文・フッターの3段組み */
export function screen(className: string, ...children: Child[]): HTMLElement {
  return h('section', { class: `screen ${className}` }, ...children);
}

export function clear(root: HTMLElement): void {
  while (root.firstChild) root.removeChild(root.firstChild);
}

/** 読み上げソフト向けに、画面が切り替わったことを伝える */
export function announce(message: string): void {
  let live = document.getElementById('a11y-live');
  if (!live) {
    live = h('div', { id: 'a11y-live', class: 'visually-hidden', 'aria-live': 'polite' });
    document.body.appendChild(live);
  }
  live.textContent = message;
}
