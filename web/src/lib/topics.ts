// Topic names come from the AI in lowercase; show them in sentence case, keeping acronyms.
export function topicLabel(topic: string) {
  const keepUpper = new Set(['ai', 'rag', 'llm', 'api', 'ui', 'ux', 'css', 'html', 'sql', 'aws', 'gcp', 'seo', 'dsa', 'ml', 'n8n']);
  return topic
    .split(/\s+/)
    .map((w, i) => (keepUpper.has(w) ? w.toUpperCase() : i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}
