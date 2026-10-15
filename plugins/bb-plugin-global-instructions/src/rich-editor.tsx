import { useEffect, useRef, useState } from "react";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import { Markdown } from "tiptap-markdown";
import { Button } from "@/vendor/components/ui/button";

export function RichEditor({ value, disabled, onChange }: {
  value: string;
  disabled: boolean;
  onChange(value: string): void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const instance = useRef<Editor | null>(null);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  const [editor, setEditor] = useState<Editor | null>(null);
  const [, renderSelection] = useState(0);

  useEffect(() => {
    if (!root.current) return;
    const editor = new Editor({
      element: root.current,
      injectCSS: false,
      extensions: [
        StarterKit, Link.configure({ openOnClick: false }),
        Image, TaskList, TaskItem.configure({ nested: true }),
        Table, TableRow, TableHeader, TableCell,
        Markdown.configure({ html: false, tightLists: true, bulletListMarker: "-", transformPastedText: true }),
      ],
      content: latest.current.value,
      editorProps: {
        attributes: { role: "textbox", "aria-label": "Global instructions", "aria-multiline": "true" },
      },
      // Mounting and mode switches must never serialize or dirty the source.
      onUpdate: ({ editor }) => latest.current.onChange(editor.storage.markdown.getMarkdown()),
      onTransaction: () => renderSelection((current) => current + 1),
    });
    instance.current = editor;
    setEditor(editor);
    return () => { instance.current = null; editor.destroy(); };
  }, []);

  useEffect(() => { instance.current?.setEditable(!disabled, false); }, [disabled, editor]);

  const actions = [
    { label: "Bold", active: editor?.isActive("bold"), run: () => editor?.chain().focus().toggleBold().run() },
    { label: "Italic", active: editor?.isActive("italic"), run: () => editor?.chain().focus().toggleItalic().run() },
    { label: "Heading", active: editor?.isActive("heading", { level: 2 }), run: () => editor?.chain().focus().toggleHeading({ level: 2 }).run() },
    { label: "Bullet list", active: editor?.isActive("bulletList"), run: () => editor?.chain().focus().toggleBulletList().run() },
    { label: "Numbered list", active: editor?.isActive("orderedList"), run: () => editor?.chain().focus().toggleOrderedList().run() },
    { label: "Quote", active: editor?.isActive("blockquote"), run: () => editor?.chain().focus().toggleBlockquote().run() },
    { label: "Code", active: editor?.isActive("codeBlock"), run: () => editor?.chain().focus().toggleCodeBlock().run() },
  ];
  return (
    <div className="global-instructions-rich-shell rounded-md border border-border bg-background">
      <div role="toolbar" aria-label="Markdown formatting" className="flex shrink-0 flex-wrap gap-1 border-b border-border p-2">
        {actions.map(({ label, active, run }) => (
          <Button key={label} type="button" size="sm" variant={active ? "secondary" : "ghost"}
            aria-pressed={Boolean(active)} disabled={disabled || !editor} onClick={run}>{label}</Button>
        ))}
        <Button type="button" size="sm" variant="ghost" disabled={disabled || !editor?.can().undo()}
          onClick={() => editor?.chain().focus().undo().run()}>Undo</Button>
        <Button type="button" size="sm" variant="ghost" disabled={disabled || !editor?.can().redo()}
          onClick={() => editor?.chain().focus().redo().run()}>Redo</Button>
      </div>
      <div ref={root} className="global-instructions-rich" />
    </div>
  );
}
