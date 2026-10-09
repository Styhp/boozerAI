// Boozer graph workspace — interface words used by the reference GraphView.
// The complete copy deck (every pane, state and error) is COPY.md. Keep wording exact:
// several phrases are required by PRODUCT.md / C1 ("potentially affected", "may be wrong").

export const SKIP_WORDS: Readonly<Record<string, readonly [label: string, consequence: string]>> = {
  'secret-name': ['Looks like a secrets file', 'Boozer never reads files named like .env, so keys stay out of view and out of any AI prompt.'],
  oversize: ['Too large to read', 'Over the 1 MiB per-file limit. Its imports, and anything it connects to, are missing from the map.'],
  'parse-error': ['Couldn’t be parsed', 'The code has a syntax error, so Boozer can show the text but found no connections in it.'],
  binary: ['Not code Boozer reads', 'Binary files are listed but never opened.'],
  'unsupported-extension': ['Not code Boozer reads', 'Boozer only reads JavaScript and TypeScript, so stylesheets and data files are not followed.'],
  ignored: ['Folder not opened', 'Installed packages and build output are skipped on purpose.'],
  symlink: ['Couldn’t be read safely', 'Links that point outside the folder are never followed.'],
  unreadable: ['Couldn’t be read safely', 'The file couldn’t be opened.'],
  'case-collision': ['Couldn’t be read safely', 'Two files differ only by upper/lower case, so neither was read.'],
};

export const ISSUE_WORDS: Readonly<Record<string, readonly [label: string, consequence: string]>> = {
  'unsupported-alias': ['Shortcut path not supported yet', 'Paths starting with @/ are set up in the build config. Boozer doesn’t read that config, so it can’t tell which file this is.'],
  'non-literal': ['Path is built while the app runs', 'The file name is assembled from a variable, so it can only be known when the code runs.'],
  'unsupported-extension': ['Points at a file that isn’t code', 'Boozer only reads JavaScript and TypeScript, so stylesheets and data files are not followed.'],
  'not-found': ['File not found', 'No file with this path was in the folder Boozer read.'],
  'outside-root': ['Points outside the folder', 'Boozer only reads inside the folder you chose.'],
  'absolute-path': ['Points outside the folder', 'Absolute paths are not followed.'],
  'ambiguous-require': ['Written in a way Boozer can’t follow yet', 'This require call can’t be resolved by reading the code.'],
  'unsupported-syntax': ['Written in a way Boozer can’t follow yet', 'This import form isn’t supported yet.'],
  'secret-name': ['Points at a secrets file', 'Boozer never reads files named like .env.'],
  oversize: ['Points at a file too large to read', 'Over the 1 MiB per-file limit.'],
};

export const GRAPH_COPY = {
  canvasLabel: 'Graph of files and their imports. Use the file tree for a keyboard-friendly list.',
  hint: 'Point at a dot to see what it connects to · click to open it',
  hintTouch: 'Tap a dot to open it',
  legend: { uses: 'uses', usedBy: 'used by', typeOnly: 'types only', gap: 'couldn’t follow', size: 'Bigger dot = more files use it (not more important)' },
  card: {
    found: 'Found in code',
    uses: (files: number, pkgs: number) => `→ uses ${files} ${files === 1 ? 'file' : 'files'}${pkgs ? ` + ${pkgs} ${pkgs === 1 ? 'package' : 'packages'}` : ''}`,
    usedBy: (n: number) => `← used by ${n}`,
    importsThis: 'imports this',
    noImports: 'No imports in this file.',
    parseError: 'Couldn’t be parsed. No connections found in it.',
    more: (n: number) => `+ ${n} more import ${n === 1 ? 'line' : 'lines'}`,
    moreImporters: (n: number) => `+ ${n} more`,
    footFile: 'Click to open · lines found by reading the code',
    package: 'Package',
    footPackage: 'Code installed from outside your project. Boozer doesn’t read inside it.',
    gap: 'Not analysed',
  },
  replay: {
    title: (label: string) => `Drawing what Boozer found in ${label}…`,
    progress: (done: number, total: number, imports: number) => `${done} of ${total} files · ${imports} imports`,
    fileLine: (path: string, imports: number) => `${path} — ${imports} ${imports === 1 ? 'import' : 'imports'}`,
    parseErrorLine: (path: string) => `${path} — syntax error, no imports read`,
    skipLine: (path: string, label: string) => `Skipped ${path} — ${label.toLowerCase()}`,
    skip: 'Skip',
  },
  settings: {
    title: 'Graph settings', filters: 'Filters', display: 'Display', search: 'Search files…',
    packages: 'Packages', gaps: 'Imports Boozer couldn’t follow', typeLinks: 'Type-only links', arrows: 'Arrows', labels: 'File names',
    note: 'Hidden items are still counted on Overview.',
  },
  fit: 'Fit graph',
} as const;
