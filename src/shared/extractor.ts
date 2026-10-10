import { createHash } from 'node:crypto';
import * as ts from 'typescript';
import type {
  AnalysisCoverage, DependencyEdge, DependencyGraph, EdgeKind, EdgeTarget, EvidenceRef,
  FileNode, FileSkip, Language, SnapshotFile, WorkspaceSnapshot,
} from './contracts.js';
import { RESOLVER_VERSION, SnapshotResolver } from './resolver.js';

export const EXTRACTOR_IDENTITY = Object.freeze({ name: 'boozer-typescript', version: '1' });
export const ANALYSIS_KEY = `${EXTRACTOR_IDENTITY.name}/${EXTRACTOR_IDENTITY.version}/ts-${ts.version}/${RESOLVER_VERSION}`;
const bytewise = (a: string, b: string) => Buffer.compare(Buffer.from(a), Buffer.from(b));
const scriptKinds: Readonly<Record<Language, ts.ScriptKind>> = {
  js: ts.ScriptKind.JS, jsx: ts.ScriptKind.JSX, ts: ts.ScriptKind.TS, tsx: ts.ScriptKind.TSX,
  mjs: ts.ScriptKind.JS, cjs: ts.ScriptKind.JS,
};
const skipReasons = new Set(['ignored', 'secret-name', 'unsupported-extension', 'binary', 'oversize',
  'symlink', 'unreadable', 'case-collision']);

export class ExtractionError extends Error {
  constructor() { super('Dependency extraction failed: invalid-snapshot'); this.name = 'ExtractionError'; }
}

function validateSnapshot(snapshot: WorkspaceSnapshot): void {
  const paths = new Set<string>();
  const addPath = (path: string) => {
    if (typeof path !== 'string' || path.length === 0 || path.includes('\\') || path.includes('\0')
      || /^[a-z]:/i.test(path) || path.split('/').some((part) => part === '' || part === '.' || part === '..')
      || paths.has(path)) throw new ExtractionError();
    paths.add(path);
  };
  if (snapshot.schemaVersion !== 1 || !snapshot.snapshotId || !snapshot.projectId
    || !Number.isSafeInteger(snapshot.inventory.found)
    || snapshot.inventory.found !== snapshot.files.length + snapshot.inventory.skipped.length) throw new ExtractionError();
  for (const file of snapshot.files) {
    addPath(file.path);
    if (!Object.hasOwn(scriptKinds, file.language) || typeof file.text !== 'string'
      || Buffer.byteLength(file.text, 'utf8') !== file.sizeBytes
      || createHash('sha256').update(file.text, 'utf8').digest('hex') !== file.contentHash) throw new ExtractionError();
  }
  for (const document of snapshot.documents ?? []) {
    addPath(document.path);
    if (!['markdown', 'manifest'].includes(document.kind) || typeof document.text !== 'string'
      || Buffer.byteLength(document.text, 'utf8') !== document.sizeBytes
      || createHash('sha256').update(document.text, 'utf8').digest('hex') !== document.contentHash) throw new ExtractionError();
  }
  for (const skip of snapshot.inventory.skipped) {
    addPath(skip.path);
    if (!skipReasons.has(skip.reason)) throw new ExtractionError();
  }
}

interface Scope { readonly parent: Scope | undefined; readonly functionScope: boolean; requireBinding: boolean }
interface Candidate {
  readonly node: ts.Node;
  readonly argument: ts.Expression | undefined;
  readonly kind: EdgeKind;
  readonly scope: Scope;
  readonly unsupported?: string;
}

function bindsRequire(name: ts.BindingName): boolean {
  const pending: ts.BindingName[] = [name];
  while (pending.length > 0) {
    const binding = pending.pop()!;
    if (ts.isIdentifier(binding)) {
      if (binding.text === 'require') return true;
    } else {
      for (const element of binding.elements) if (ts.isBindingElement(element)) pending.push(element.name);
    }
  }
  return false;
}

function functionScope(scope: Scope): Scope {
  while (!scope.functionScope && scope.parent !== undefined) scope = scope.parent;
  return scope;
}

function shadowed(scope: Scope): boolean {
  for (let current: Scope | undefined = scope; current !== undefined; current = current.parent) {
    if (current.requireBinding) return true;
  }
  return false;
}

function statement(node: ts.Node): ts.Node {
  while (!ts.isStatement(node) && node.parent !== undefined && !ts.isSourceFile(node.parent)) node = node.parent;
  return node;
}

function reference(source: ts.SourceFile, file: SnapshotFile, snapshotId: string, node: ts.Node): EvidenceRef {
  const enclosing = statement(node);
  return Object.freeze({
    snapshotId, file: file.path, contentHash: file.contentHash,
    startLine: source.getLineAndCharacterOfPosition(enclosing.getStart(source)).line + 1,
    endLine: source.getLineAndCharacterOfPosition(Math.max(enclosing.getStart(source), enclosing.end - 1)).line + 1,
  });
}

function candidates(source: ts.SourceFile): { candidates: Candidate[]; dynamicScopes: ts.Node[] } {
  const root: Scope = { parent: undefined, functionScope: true, requireBinding: false };
  const pending: { node: ts.Node; scope: Scope }[] = [{ node: source, scope: root }];
  const found: Candidate[] = [];
  const dynamicScopes: ts.Node[] = [];
  while (pending.length > 0) {
    const item = pending.pop()!;
    const node = item.node;
    let scope = item.scope;
    // Collect bindings for the entire scope before resolving calls, including hoists/TDZ.
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'require') functionScope(scope).requireBinding = true;
    if ((ts.isClassDeclaration(node) || ts.isEnumDeclaration(node)) && node.name?.text === 'require') scope.requireBinding = true;
    if (ts.isModuleDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'require') scope.requireBinding = true;
    if (ts.isFunctionLike(node) || ts.isClassExpression(node) || ts.isBlock(node) || ts.isModuleBlock(node)
      || ts.isCaseBlock(node) || ts.isCatchClause(node) || ts.isForStatement(node)
      || ts.isForOfStatement(node) || ts.isForInStatement(node) || ts.isWithStatement(node)) {
      scope = { parent: scope, functionScope: ts.isFunctionLike(node), requireBinding: ts.isWithStatement(node) };
      if (ts.isWithStatement(node)) dynamicScopes.push(node);
      if ((ts.isFunctionExpression(node) || ts.isClassExpression(node)) && node.name?.text === 'require') scope.requireBinding = true;
    }
    if (ts.isParameter(node) && bindsRequire(node.name)) scope.requireBinding = true;
    if (ts.isVariableDeclaration(node) && bindsRequire(node.name)) {
      const lexical = ts.isCatchClause(node.parent)
        || (ts.isVariableDeclarationList(node.parent) && (node.parent.flags & ts.NodeFlags.BlockScoped) !== 0);
      (lexical ? scope : functionScope(scope)).requireBinding = true;
    }
    if ((ts.isImportClause(node) && node.name?.text === 'require')
      || (ts.isImportSpecifier(node) && node.name.text === 'require')
      || (ts.isNamespaceImport(node) && node.name.text === 'require')
      || (ts.isImportEqualsDeclaration(node) && node.name.text === 'require')) scope.requireBinding = true;
    if (ts.isBinaryExpression(node) && ts.isIdentifier(node.left) && node.left.text === 'require'
      && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
      functionScope(scope).requireBinding = true;
    }
    if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) && ts.isIdentifier(node.operand)
      && node.operand.text === 'require' && (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)) {
      functionScope(scope).requireBinding = true;
    }
    if ((ts.isForOfStatement(node) || ts.isForInStatement(node)) && ts.isIdentifier(node.initializer)
      && node.initializer.text === 'require') functionScope(scope).requireBinding = true;
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const allNamedTypes = clause?.name === undefined && clause?.namedBindings !== undefined
        && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.length > 0
        && clause.namedBindings.elements.every((element) => element.isTypeOnly);
      found.push({ node, argument: node.moduleSpecifier, kind: clause?.isTypeOnly || allNamedTypes ? 'type-import' : 'import', scope });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
      found.push({ node, argument: node.moduleSpecifier, kind: 're-export', scope });
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      found.push({ node, argument: node.moduleReference.expression, kind: 'require', scope, unsupported: 'import-equals' });
    } else if (ts.isImportTypeNode(node)) {
      const argument = ts.isLiteralTypeNode(node.argument) ? node.argument.literal : undefined;
      found.push({ node, argument, kind: 'type-import', scope, unsupported: 'import-type' });
    } else if (ts.isCallExpression(node)) {
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      if (isRequire || node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const invalidArity = node.arguments.length === 0 || (isRequire ? node.arguments.length !== 1 : node.arguments.length > 2);
        found.push({ node, argument: node.arguments[0], kind: isRequire ? 'require' : 'dynamic-import', scope,
          ...(invalidArity || node.questionDotToken !== undefined ? { unsupported: 'call-arguments' } : {}) });
      } else if (ts.isIdentifier(node.expression) && node.expression.text === 'eval') {
        functionScope(scope).requireBinding = true;
        dynamicScopes.push(node);
      }
    }
    const children: ts.Node[] = [];
    ts.forEachChild(node, (child) => { children.push(child); });
    for (let index = children.length - 1; index >= 0; index--) pending.push({ node: children[index]!, scope });
  }
  found.sort((a, b) => a.node.getStart(source) - b.node.getStart(source));
  return { candidates: found, dynamicScopes };
}

/** Pure snapshot -> immutable graph. It never loads, transpiles or executes target code. */
export function extractDependencies(snapshot: WorkspaceSnapshot): DependencyGraph {
  validateSnapshot(snapshot);
  const resolver = new SnapshotResolver(snapshot.files, [...snapshot.inventory.skipped,
    ...(snapshot.documents ?? []).map(({ path }) => ({ path, reason: 'unsupported-extension' as const }))]);
  const files: FileNode[] = [];
  const edges: DependencyEdge[] = [];
  const skips: FileSkip[] = snapshot.inventory.skipped.map((skip) => Object.freeze({ ...skip }));
  const unsupported: AnalysisCoverage['unsupported'][number][] = [];
  let parsed = 0;
  for (const file of [...snapshot.files].sort((a, b) => bytewise(a.path, b.path))) {
    const source = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true, scriptKinds[file.language]);
    // The pinned TS 6 parser exposes syntax diagnostics on SourceFile. Do not create
    // a Program/default CompilerHost just to retrieve them: those can read disk.
    const diagnostics = (source as ts.SourceFile & { readonly parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics;
    if (!Array.isArray(diagnostics)) throw new ExtractionError();
    const parseError = diagnostics.length > 0;
    files.push(Object.freeze({ path: file.path, language: file.language, sizeBytes: file.sizeBytes,
      contentHash: file.contentHash, parse: Object.freeze(parseError ? { status: 'error', reason: 'parse-error' } as const : { status: 'ok' } as const) }));
    if (parseError) { skips.push(Object.freeze({ path: file.path, reason: 'parse-error' })); continue; }
    parsed++;
    const scanned = candidates(source);
    for (const [index, candidate] of scanned.candidates.entries()) {
      const { argument } = candidate;
      const literal = argument !== undefined && ts.isStringLiteralLike(argument);
      const specifier = argument === undefined ? candidate.node.getText(source)
        : literal ? argument.getText(source).slice(1, -1) : argument.getText(source);
      const evidence = reference(source, file, snapshot.snapshotId, candidate.node);
      let target: EdgeTarget;
      if (candidate.unsupported !== undefined) {
        target = { type: 'unresolved', reason: 'unsupported-syntax' };
        unsupported.push(Object.freeze({ reason: candidate.unsupported, evidence }));
      } else if (candidate.kind === 'require' && shadowed(candidate.scope)) {
        target = { type: 'unresolved', reason: 'ambiguous-require' };
      } else if (!literal) {
        target = { type: 'unresolved', reason: 'non-literal' };
      } else {
        target = resolver.resolve(file.path, argument.text);
        if (target.type === 'unresolved' && target.reason === 'unsupported-syntax') {
          unsupported.push(Object.freeze({ reason: 'specifier-syntax', evidence }));
        }
      }
      edges.push(Object.freeze({ id: `${file.path}#${index + 1}`, from: file.path, specifier,
        kind: candidate.kind, target: Object.freeze(target), evidence }));
    }
    for (const node of scanned.dynamicScopes) unsupported.push(Object.freeze({
      reason: 'dynamic-scope', evidence: reference(source, file, snapshot.snapshotId, node),
    }));
  }
  skips.sort((a, b) => bytewise(a.path, b.path));
  unsupported.sort((a, b) => bytewise(a.evidence.file, b.evidence.file)
    || a.evidence.startLine - b.evidence.startLine || a.evidence.endLine - b.evidence.endLine || bytewise(a.reason, b.reason));
  const counts = { resolved: 0, external: 0, excluded: 0, failed: 0 };
  const issues: AnalysisCoverage['imports']['issues'][number][] = [];
  for (const edge of edges) {
    switch (edge.target.type) {
      case 'file': counts.resolved++; break;
      case 'package': counts.external++; break;
      case 'excluded': counts.excluded++; issues.push(Object.freeze({ edgeId: edge.id, outcome: 'excluded', reason: edge.target.reason })); break;
      case 'unresolved': counts.failed++; issues.push(Object.freeze({ edgeId: edge.id, outcome: 'failed', reason: edge.target.reason })); break;
    }
  }
  return Object.freeze({ schemaVersion: 1, snapshotId: snapshot.snapshotId, extractor: EXTRACTOR_IDENTITY,
    ...(snapshot.documents?.length ? { documents: Object.freeze([...snapshot.documents].sort((a, b) => bytewise(a.path, b.path))
      .map(({ text: _text, ...info }) => Object.freeze(info))) } : {}),
    files: Object.freeze(files), edges: Object.freeze(edges), coverage: Object.freeze({
      files: Object.freeze({ found: snapshot.inventory.found, parsed, skipped: skips.length,
        skips: Object.freeze(skips), prunedDirectories: Object.freeze(snapshot.inventory.prunedDirectories
          .map((entry) => Object.freeze({ ...entry })).sort((a, b) => bytewise(a.path, b.path))) }),
      imports: Object.freeze({ seen: edges.length, ...counts, issues: Object.freeze(issues) }),
      unsupported: Object.freeze(unsupported),
    }),
  });
}

/** Display contract: zero denominators are absent, never 100%. */
export function coverageRates(coverage: AnalysisCoverage): { readonly parsedFiles: number | null; readonly localImportResolution: number | null } {
  return Object.freeze({ parsedFiles: coverage.files.found === 0 ? null : coverage.files.parsed / coverage.files.found,
    localImportResolution: coverage.imports.seen === 0 ? null : coverage.imports.resolved / coverage.imports.seen });
}
