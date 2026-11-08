const ALLOWED_TAGS = new Set(['STRONG', 'EM', 'U', 'UL', 'OL', 'LI', 'BR', 'P']);

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[character] ?? character));
}

/**
 * Keeps a deliberately small HTML subset for user-authored rich text.
 * Plain-text descriptions continue to work and line breaks are preserved.
 */
export function sanitizeRichText(value: string | undefined | null): string {
  const source = value ?? '';
  if (!source) return '';

  if (typeof document === 'undefined') return source;

  if (!/<\/?[a-z][\s\S]*>/i.test(source)) {
    return escapeHtml(source).replace(/\r?\n/g, '<br>');
  }

  const parsed = new DOMParser().parseFromString(source, 'text/html');
  const clean = (root: ParentNode) => {
    for (const child of [...root.childNodes]) {
      if (child.nodeType !== Node.ELEMENT_NODE) continue;

      const element = child as HTMLElement;
      if (!ALLOWED_TAGS.has(element.tagName)) {
        const content = document.createDocumentFragment();
        while (element.firstChild) content.appendChild(element.firstChild);
        element.replaceWith(content);
        clean(root);
        continue;
      }

      for (const attribute of [...element.attributes]) {
        element.removeAttribute(attribute.name);
      }
      clean(element);
    }
  };

  clean(parsed.body);
  return parsed.body.innerHTML;
}
