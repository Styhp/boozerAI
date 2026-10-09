// Boozer glyph set: original 16×16 line icons, 1.5px stroke, round caps and joins, currentColor.
// Sizes in use: 18px in the ribbon, 16px in buttons and headers, 14px in tabs, 13px in tags, 20px in the narrow tab bar.
// Do not substitute Athelstan's ShellGlyph paths (they come from another design) or emoji.
import type { ReactNode } from 'react';

const paths = {
  files: <path d="M2.5 4.5V12a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H8L6.5 3.5h-3a1 1 0 0 0-1 1Z" />,
  search: <><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></>,
  overview: <path d="M2.5 3.5h11M2.5 8h7M2.5 12.5h9" />,
  notes: <><path d="M3 2.5h7l3 3v8H3z" /><path d="M5.5 7.5h5M5.5 10.5h3.5" /></>,
  graph: <><circle cx="4" cy="4" r="1.8" /><circle cx="12" cy="5" r="1.8" /><circle cx="7" cy="12" r="1.8" /><path d="M5.6 4.4 10.3 4.8M4.8 5.6 6.3 10.3M11 6.5 8.2 10.6" /></>,
  gear: <><circle cx="8" cy="8" r="2.1" /><path d="M8 1.8v1.6M8 12.6v1.6M14.2 8h-1.6M3.4 8H1.8M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7 3.6 3.6" /></>,
  fit: <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />,
  back: <path d="M10 3 5 8l5 5" />,
  forward: <path d="m6 3 5 5-5 5" />,
  close: <path d="m4 4 8 8M12 4l-8 8" />,
  chevron: <path d="m4.5 6 3.5 3.5L11.5 6" />,
  code: <path d="M5.5 4 2 8l3.5 4M10.5 4 14 8l-3.5 4" />,
  book: <path d="M8 4c-1.5-1-3.5-1.3-5.5-1v9.5c2-.3 4 0 5.5 1 1.5-1 3.5-1.3 5.5-1V3c-2-.3-4 0-5.5 1Zm0 0v9.5" />,
  file: <><path d="M4 1.8h5.5L12.5 5v9.2H4z" /><path d="M9.5 1.8V5h3" /></>,
  uses: <path d="M2.5 8h10M9 4.5 12.5 8 9 11.5" />,
  usedBy: <path d="M13.5 8h-10M7 4.5 3.5 8 7 11.5" />,
  fact: <path d="M3 8.5 6.5 12 13 4" />,
  ai: <path d="M3 4h10v6.5H7.5L4.5 13v-2.5H3z" />,
  pen: <path d="M10.5 2.5 13.5 5.5 6 13H3v-3z" />,
  gap: <><circle cx="8" cy="8" r="6" strokeDasharray="2 2" /><path d="M8 5v3.5M8 11h.01" /></>,
  danger: <><path d="M8 2 14.5 13.5h-13z" /><path d="M8 6.5v3M8 11.5h.01" /></>,
  globe: <><circle cx="8" cy="8" r="6" /><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12" /></>,
  refresh: <><path d="M13 5.5A5.5 5.5 0 1 0 13.5 9" /><path d="M13.5 2v3.5H10" /></>,
  folderOpen: <><path d="M2.5 12.5V4a1 1 0 0 1 1-1h3L8 4.5h4.5a1 1 0 0 1 1 1V7" /><path d="M2.5 12.5 4.3 7.6a1 1 0 0 1 .9-.6h9.3l-2 5.5H2.5Z" /></>,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true" className={className}
      fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

/* Where each glyph is used
   files ........ ribbon: file tree · narrow tab bar: Files · graph header: toggle tree
   search ....... ribbon: search files
   overview ..... ribbon / tab bar / pane tab: Overview · tree header: collapse all
   notes ........ ribbon / tab bar / pane tab: My notes (with a 7px gap-ink dot when a note needs a look)
   graph ........ graph tab · narrow tab bar: Graph
   gear, fit .... graph tools (top right of the canvas)
   back, forward  pane history · "Back to the explanation"
   close ........ pane tab ×, sidebar ×
   chevron ...... tree folders (rotated -90° when collapsed, 160ms)
   code / book .. pane header toggle: code = show source, book = back to the note
   file ......... pane tab for a file
   uses / usedBy  "This file uses" / "Used by" headings (fact-ink / brand-ink)
   fact, ai, pen, gap, danger, globe  provenance tags and notices
   refresh ...... ribbon bottom: Refresh
   folderOpen ... ribbon: Open another folder (M2-PICK)
*/
