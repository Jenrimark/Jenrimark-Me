'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { ProjectBlock } from '@jenrimark/content';

export function RichTextBlockEditor({ block, onChange }: { block: Extract<ProjectBlock, { type: 'rich_text' }>; onChange: (block: Extract<ProjectBlock, { type: 'rich_text' }>) => void }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: block.body,
    immediatelyRender: false,
    onUpdate: ({ editor: current }) => onChange({ ...block, body: current.getJSON() as Record<string, unknown> }),
  });
  if (!editor) return <div className="admin-rich-text-loading">正在打开文字编辑器…</div>;
  return <div className="admin-rich-text-editor"><div className="admin-rich-text-toolbar"><button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={editor.isActive('bold') ? 'is-active' : ''}>加粗</button><button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={editor.isActive('heading', { level: 2 }) ? 'is-active' : ''}>H2</button><button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={editor.isActive('bulletList') ? 'is-active' : ''}>列表</button><button type="button" onClick={() => editor.chain().focus().undo().run()}>撤销</button></div><EditorContent editor={editor} /></div>;
}
