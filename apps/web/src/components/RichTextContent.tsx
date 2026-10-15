import type { ReactNode } from 'react';

type RichNode = { type?: string; text?: string; content?: RichNode[]; attrs?: Record<string, unknown>; marks?: Array<{ type?: string }> };

function renderInline(node: RichNode, index: number): ReactNode {
  let value: ReactNode = node.text || (node.content || []).map((child, childIndex) => renderInline(child, childIndex));
  for (const mark of node.marks || []) {
    if (mark.type === 'bold') value = <strong key={`bold-${index}`}>{value}</strong>;
    if (mark.type === 'italic') value = <em key={`italic-${index}`}>{value}</em>;
    if (mark.type === 'link') {
      const href = String((mark as { attrs?: { href?: string } }).attrs?.href || '');
      if (/^(https?:\/\/|mailto:)/i.test(href)) value = <a key={`link-${index}`} href={href} target="_blank" rel="noreferrer">{value}</a>;
    }
  }
  return value;
}

export default function RichTextContent({ body }: { body: Record<string, unknown> }) {
  const nodes = Array.isArray(body.content) ? body.content as RichNode[] : [];
  return <div className="rich-text-content">{nodes.map((node, index) => {
    const children = (node.content || []).map((child, childIndex) => renderInline(child, childIndex));
    if (node.type === 'heading') return <h3 key={index}>{children}</h3>;
    if (node.type === 'bulletList') return <ul key={index}>{(node.content || []).map((item, itemIndex) => <li key={itemIndex}>{(item.content || []).flatMap((paragraph) => paragraph.content || []).map((child, childIndex) => renderInline(child, childIndex))}</li>)}</ul>;
    if (node.type === 'orderedList') return <ol key={index}>{(node.content || []).map((item, itemIndex) => <li key={itemIndex}>{(item.content || []).flatMap((paragraph) => paragraph.content || []).map((child, childIndex) => renderInline(child, childIndex))}</li>)}</ol>;
    return <p key={index}>{children}</p>;
  })}</div>;
}
