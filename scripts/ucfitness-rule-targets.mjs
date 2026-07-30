import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SUCCESS_OUTPUT = 'OK: UCFitness rule-check passed (0 violations)\n';
const CHALLENGE_SINGLE_ROUTE = 'app/api/challenge/[challengeId]/progress/route.ts';
const CHALLENGE_BATCH_ROUTE = 'app/api/challenge/progress/route.ts';
const CHALLENGE_ERROR_SINK_TEST = 'app/api/challenge/error-sink.test.ts';
const CHALLENGE_SERVICE_TEST = 'lib/services/challenge-progress-service.test.ts';
const CHALLENGE_SERVICE = 'lib/services/challenge-progress-service.ts';
const CHALLENGE_SINGLE_AUTH_TEST =
  'app/api/challenge/[challengeId]/operation-authorization.test.ts';
const CHALLENGE_BATCH_TEST = 'app/api/challenge/progress/route.test.ts';
const DATE_ONLY_GROUP_ID = 'date-only-parse';
const DATE_ONLY_LABEL = 'timezone依存のdate-only parse (new Date / Date.parse)';
const PRODUCTION_DIRECTORIES = ['app', 'components', 'contexts', 'hooks', 'lib', 'types'];
const PRODUCTION_ROOT_FILES = ['i18n.ts', 'middleware.ts', 'navigation.ts'];
const EXCLUDED_DIRECTORIES = new Set([
  '__fixtures__',
  '__tests__',
  'fixture',
  'fixtures',
  'test',
  'tests',
]);
const TEST_FILE_PATTERN = /\.(?:fixture|spec|test)\.tsx?$/;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const COMPLETE_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/i;
const EXPLICIT_OFFSET_PATTERN = /(?:Z|[+-]\d{2}:?\d{2})$/i;

function createRecord(id, groupId, label, body) {
  return { id, groupId, label, body };
}

function countOccurrences(source, needle) {
  let count = 0;
  let position = 0;
  while ((position = source.indexOf(needle, position)) !== -1) {
    count += 1;
    position += needle.length;
  }
  return count;
}

function readSource(root, path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function addRecord(records, condition, id, groupId, label, body) {
  if (condition) {
    records.push(createRecord(id, groupId, label, body));
  }
}

export function checkChallengeProgressAuthLogBoundary({ root = process.cwd() } = {}) {
  const records = [];
  const sources = new Map([
    [CHALLENGE_SINGLE_ROUTE, readSource(root, CHALLENGE_SINGLE_ROUTE)],
    [CHALLENGE_BATCH_ROUTE, readSource(root, CHALLENGE_BATCH_ROUTE)],
    [CHALLENGE_ERROR_SINK_TEST, readSource(root, CHALLENGE_ERROR_SINK_TEST)],
    [CHALLENGE_SERVICE_TEST, readSource(root, CHALLENGE_SERVICE_TEST)],
    [CHALLENGE_SERVICE, readSource(root, CHALLENGE_SERVICE)],
    [CHALLENGE_SINGLE_AUTH_TEST, readSource(root, CHALLENGE_SINGLE_AUTH_TEST)],
    [CHALLENGE_BATCH_TEST, readSource(root, CHALLENGE_BATCH_TEST)],
  ]);
  const routeDefinitions = [
    {
      path: CHALLENGE_SINGLE_ROUTE,
      prefix: 'single',
    },
    {
      path: CHALLENGE_BATCH_ROUTE,
      prefix: 'batch',
    },
  ];

  for (const { path, prefix } of routeDefinitions) {
    const source = sources.get(path);
    const compactSource = source.replaceAll('\n', ' ');
    const countGroupId = `${prefix}-auth-log-count`;

    addRecord(
      records,
      !/Promise<NextResponse>\s*\{\s*let authenticationComplete = false;\s*try\s*\{\s*const session = await auth\(\);\s*authenticationComplete = true;/.test(
        compactSource,
      ),
      `${prefix}-auth-catch-boundary`,
      `${prefix}-auth-catch-boundary`,
      'challenge progressのauthが固定catch境界外へ回帰',
      path,
    );
    addRecord(
      records,
      countOccurrences(source, 'const session = await auth();') !== 1,
      `${prefix}-auth-call-count`,
      countGroupId,
      'challenge progressの認証/固定ログ単一境界欠落',
      path,
    );
    addRecord(
      records,
      countOccurrences(source, 'reportError(') !== 1,
      `${prefix}-report-error-count`,
      countGroupId,
      'challenge progressの認証/固定ログ単一境界欠落',
      path,
    );
  }

  const singleSource = sources.get(CHALLENGE_SINGLE_ROUTE);
  const batchSource = sources.get(CHALLENGE_BATCH_ROUTE);
  const normalizationGroup = 'challenge-progress-normalization';
  const normalizationLabel = 'challenge progressの固定AppError正規化欠落';
  const normalizationBody = 'single/batch progress routes';

  addRecord(
    records,
    !singleSource.includes('const normalized = authenticationComplete'),
    'single-normalized-boundary',
    normalizationGroup,
    normalizationLabel,
    normalizationBody,
  );
  addRecord(
    records,
    !singleSource.includes('CHALLENGE_PROGRESS_UNAVAILABLE_CODE'),
    'single-error-code',
    normalizationGroup,
    normalizationLabel,
    normalizationBody,
  );
  addRecord(
    records,
    !/reportError\(['"]challenge:progress['"]\s*,\s*normalized\s*\);/.test(singleSource),
    'single-report-error-operation',
    normalizationGroup,
    normalizationLabel,
    normalizationBody,
  );
  addRecord(
    records,
    !batchSource.includes('const stage = authenticationComplete'),
    'batch-stage-attribution',
    normalizationGroup,
    normalizationLabel,
    normalizationBody,
  );
  addRecord(
    records,
    !/['"]Challenge progress batch request failed['"]/.test(batchSource),
    'batch-error-message',
    normalizationGroup,
    normalizationLabel,
    normalizationBody,
  );
  addRecord(
    records,
    !/['"]CHALLENGE_PROGRESS_BATCH_UNAVAILABLE['"]/.test(batchSource),
    'batch-error-code',
    normalizationGroup,
    normalizationLabel,
    normalizationBody,
  );
  addRecord(
    records,
    !/reportError\(['"]challenge:progress:batch['"]\s*,\s*normalized\s*\);/.test(
      batchSource,
    ),
    'batch-report-error-operation',
    normalizationGroup,
    normalizationLabel,
    normalizationBody,
  );

  const errorSinkPatterns = [
    ['error-sink-single-export', 'GET as GET_CHALLENGE_PROGRESS'],
    ['error-sink-batch-export', 'POST as POST_CHALLENGE_PROGRESS_BATCH'],
    ['error-sink-single-fixture', 'singleProgress:'],
    ['error-sink-batch-fixture', 'batchProgress:'],
    ['error-sink-matching-code', 'matching-code AppError'],
    [
      'error-sink-auth-failure-table',
      '$labelの$failureLabel auth障害を固定JSONへ変換し、生情報を除外する',
    ],
    ['error-sink-no-from', 'expect(mocks.from).not.toHaveBeenCalled()'],
    ['error-sink-no-rpc', 'expect(mocks.rpc).not.toHaveBeenCalled()'],
  ];
  const errorSinkSource = sources.get(CHALLENGE_ERROR_SINK_TEST);
  for (const [id, pattern] of errorSinkPatterns) {
    addRecord(
      records,
      !errorSinkSource.includes(pattern),
      id,
      id,
      'challenge progress authの実reportError sink回帰欠落',
      `${CHALLENGE_ERROR_SINK_TEST}: ${pattern}`,
    );
  }

  const serviceGroup = 'challenge-progress-service-refixed-boundary';
  const serviceLabel = 'challenge progressのmatching-code AppError再固定化回帰欠落';
  const serviceBody = 'progress service/test';
  addRecord(
    records,
    !sources
      .get(CHALLENGE_SERVICE_TEST)
      .includes('同一codeのAppErrorも固定fieldだけの新しいErrorへ再構築する'),
    'service-refixed-test',
    serviceGroup,
    serviceLabel,
    serviceBody,
  );
  addRecord(
    records,
    !sources.get(CHALLENGE_SERVICE).includes('return progressFailure(stage);'),
    'service-refixed-boundary',
    serviceGroup,
    serviceLabel,
    serviceBody,
  );

  const authorizationGroup = 'challenge-progress-unauthorized-tests';
  const authorizationLabel = 'challenge progressの未認証401回帰欠落';
  const authorizationBody = 'single/batch progress route tests';
  addRecord(
    records,
    !sources
      .get(CHALLENGE_SINGLE_AUTH_TEST)
      .includes('progressは未認証の場合、DB処理前に401を返す'),
    'single-unauthorized-test',
    authorizationGroup,
    authorizationLabel,
    authorizationBody,
  );
  addRecord(
    records,
    !sources
      .get(CHALLENGE_BATCH_TEST)
      .includes('未認証の場合、batch処理前に401を返す'),
    'batch-unauthorized-test',
    authorizationGroup,
    authorizationLabel,
    authorizationBody,
  );

  return records;
}

function isProductionFile(root, file) {
  const relativePath = relative(root, file);
  const segments = relativePath.split(sep);
  return (
    (file.endsWith('.ts') || file.endsWith('.tsx')) &&
    !TEST_FILE_PATTERN.test(basename(file)) &&
    !segments.some((segment) => EXCLUDED_DIRECTORIES.has(segment))
  );
}

function collectProductionFiles(root) {
  const files = [];

  const collectFiles = (entryPath) => {
    try {
      const stats = statSync(entryPath);
      if (stats.isFile()) {
        if (isProductionFile(root, entryPath)) {
          files.push(entryPath);
        }
        return;
      }
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return;
      }
      throw error;
    }

    for (const entry of readdirSync(entryPath, { withFileTypes: true })) {
      if (!entry.isSymbolicLink()) {
        collectFiles(resolve(entryPath, entry.name));
      }
    }
  };

  for (const directory of PRODUCTION_DIRECTORIES) {
    collectFiles(resolve(root, directory));
  }
  for (const file of PRODUCTION_ROOT_FILES) {
    collectFiles(resolve(root, file));
  }
  return files;
}

function normalizeTypeScriptModule(loadedModule) {
  const typescript = loadedModule?.default ?? loadedModule;
  if (
    typeof typescript !== 'object' ||
    typescript === null ||
    typeof typescript.createProgram !== 'function'
  ) {
    throw new Error('Invalid TypeScript module');
  }
  return typescript;
}

async function loadDefaultTypeScript() {
  return import('typescript');
}

export async function checkDateOnlyParse({
  scanRoot = '.',
  cwd = process.cwd(),
  loadTypeScript = loadDefaultTypeScript,
} = {}) {
  const root = resolve(cwd, scanRoot);
  const ts = normalizeTypeScriptModule(await loadTypeScript());
  const files = collectProductionFiles(root);
  const records = [];
  let checker = null;

  const unwrapExpression = (node) => {
    if (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isTypeAssertionExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isSatisfiesExpression(node)
    ) {
      return unwrapExpression(node.expression);
    }
    return node;
  };

  const isTimestampName = (name) => {
    const lowerName = name.toLowerCase();
    return (
      lowerName === 'timestamp' ||
      lowerName === 'snapshot' ||
      lowerName.endsWith('_at') ||
      lowerName.endsWith('_timestamp') ||
      name.endsWith('At') ||
      name.endsWith('Iso') ||
      name.endsWith('Timestamp')
    );
  };

  const getPropertyName = (node) => {
    if (ts.isPropertyAccessExpression(node)) {
      return node.name.text;
    }
    if (
      ts.isElementAccessExpression(node) &&
      node.argumentExpression &&
      ts.isStringLiteralLike(node.argumentExpression)
    ) {
      return node.argumentExpression.text;
    }
    return null;
  };

  const isNullishType = (type) =>
    (type.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void)) !== 0;

  const everyNonNullishTypePart = (type, predicate) => {
    const parts = type.isUnion() ? type.types : [type];
    const nonNullishParts = parts.filter((part) => !isNullishType(part));
    return nonNullishParts.length > 0 && nonNullishParts.every(predicate);
  };

  const isNumberType = (node) => {
    if (checker === null) {
      return false;
    }
    const type = checker.getTypeAtLocation(node);
    return everyNonNullishTypePart(
      type,
      (part) => (part.flags & ts.TypeFlags.NumberLike) !== 0,
    );
  };

  const isDateType = (node) => {
    if (checker === null) {
      return false;
    }
    const type = checker.getTypeAtLocation(node);
    return everyNonNullishTypePart(type, (part) => {
      const symbol = part.getSymbol() ?? part.aliasSymbol;
      return symbol?.getName() === 'Date';
    });
  };

  const flattenStringConstruction = (node) => {
    const expression = unwrapExpression(node);
    if (ts.isStringLiteralLike(expression)) {
      return { text: expression.text, dynamicExpressions: [] };
    }
    if (ts.isTemplateExpression(expression)) {
      const dynamicExpressions = [];
      let text = expression.head.text;
      for (const span of expression.templateSpans) {
        dynamicExpressions.push(span.expression);
        text += `{expression}${span.literal.text}`;
      }
      return { text, dynamicExpressions };
    }
    if (
      ts.isBinaryExpression(expression) &&
      expression.operatorToken.kind === ts.SyntaxKind.PlusToken
    ) {
      const left = flattenStringConstruction(expression.left);
      const right = flattenStringConstruction(expression.right);
      return {
        text: left.text + right.text,
        dynamicExpressions: [...left.dynamicExpressions, ...right.dynamicExpressions],
      };
    }
    return { text: '{expression}', dynamicExpressions: [expression] };
  };

  const isSafeStaticString = (text) => {
    const normalized = text.trim();
    if (DATE_ONLY_PATTERN.test(normalized)) {
      return false;
    }
    return COMPLETE_TIMESTAMP_PATTERN.test(normalized) || !DATE_ONLY_PATTERN.test(normalized);
  };

  const isSafeTimestampReference = (node) => {
    const expression = unwrapExpression(node);
    if (ts.isIdentifier(expression)) {
      return isTimestampName(expression.text);
    }
    const propertyName = getPropertyName(expression);
    return propertyName !== null && isTimestampName(propertyName);
  };

  const isSafeDateArgument = (node) => {
    const expression = unwrapExpression(node);

    if (ts.isStringLiteralLike(expression)) {
      return isSafeStaticString(expression.text);
    }
    if (ts.isNumericLiteral(expression) || isNumberType(expression) || isDateType(expression)) {
      return true;
    }
    if (
      ts.isNewExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === 'Date'
    ) {
      return true;
    }
    if (
      ts.isCallExpression(expression) &&
      ts.isPropertyAccessExpression(expression.expression) &&
      ts.isIdentifier(expression.expression.expression) &&
      expression.expression.expression.text === 'Date' &&
      (expression.expression.name.text === 'now' || expression.expression.name.text === 'UTC')
    ) {
      return true;
    }
    if (
      ts.isConditionalExpression(expression) &&
      isSafeDateArgument(expression.whenTrue) &&
      isSafeDateArgument(expression.whenFalse)
    ) {
      return true;
    }
    if (
      ts.isBinaryExpression(expression) &&
      expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
      isSafeDateArgument(expression.left) &&
      isSafeDateArgument(expression.right)
    ) {
      return true;
    }
    if (ts.isIdentifier(expression) || getPropertyName(expression) !== null) {
      return isSafeTimestampReference(expression);
    }
    if (
      ts.isTemplateExpression(expression) ||
      (ts.isBinaryExpression(expression) &&
        expression.operatorToken.kind === ts.SyntaxKind.PlusToken)
    ) {
      const flattened = flattenStringConstruction(expression);
      if (EXPLICIT_OFFSET_PATTERN.test(flattened.text)) {
        return true;
      }
      if (flattened.dynamicExpressions.length === 0) {
        return isSafeStaticString(flattened.text);
      }
      const dynamicOnlyText = flattened.text.replaceAll('{expression}', '').length === 0;
      return (
        dynamicOnlyText &&
        flattened.dynamicExpressions.every(isSafeTimestampReference)
      );
    }
    return false;
  };

  const getDateParseKind = (node) => {
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'Date'
    ) {
      return 'new Date';
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'Date' &&
      node.expression.name.text === 'parse'
    ) {
      return 'Date.parse';
    }
    return null;
  };

  const dateArgumentNeedsTypeChecker = (node) => {
    const expression = unwrapExpression(node);
    if (ts.isStringLiteralLike(expression) || ts.isNumericLiteral(expression)) {
      return false;
    }
    if (
      ts.isNewExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === 'Date'
    ) {
      return false;
    }
    if (
      ts.isCallExpression(expression) &&
      ts.isPropertyAccessExpression(expression.expression) &&
      ts.isIdentifier(expression.expression.expression) &&
      expression.expression.expression.text === 'Date' &&
      (expression.expression.name.text === 'now' || expression.expression.name.text === 'UTC')
    ) {
      return false;
    }
    if (ts.isConditionalExpression(expression)) {
      return (
        dateArgumentNeedsTypeChecker(expression.whenTrue) ||
        dateArgumentNeedsTypeChecker(expression.whenFalse)
      );
    }
    if (
      ts.isBinaryExpression(expression) &&
      expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
    ) {
      return (
        dateArgumentNeedsTypeChecker(expression.left) ||
        dateArgumentNeedsTypeChecker(expression.right)
      );
    }
    if (ts.isIdentifier(expression) || getPropertyName(expression) !== null) {
      return !isSafeTimestampReference(expression);
    }
    if (ts.isTemplateExpression(expression)) {
      return false;
    }
    return true;
  };

  // Literal-only scans avoid Program construction; any type-dependent input keeps the original checker path.
  const syntaxSourceFiles = files.map((file) =>
    ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    ),
  );
  const needsTypeChecker = syntaxSourceFiles.some((sourceFile) => {
    let requiresChecker = false;
    const visit = (node) => {
      if (requiresChecker) {
        return;
      }
      const parseKind = getDateParseKind(node);
      const firstArgument = node.arguments?.[0];
      const hasSafeArity =
        parseKind === 'new Date' && (node.arguments?.length ?? 0) !== 1;
      if (
        parseKind !== null &&
        firstArgument &&
        !hasSafeArity &&
        dateArgumentNeedsTypeChecker(firstArgument)
      ) {
        requiresChecker = true;
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return requiresChecker;
  });

  let sourceFiles = syntaxSourceFiles;
  if (needsTypeChecker) {
    const program = ts.createProgram(files, {
      jsx: ts.JsxEmit.Preserve,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.Latest,
    });
    checker = program.getTypeChecker();
    sourceFiles = files.flatMap((file) => {
      const sourceFile = program.getSourceFile(file);
      return sourceFile ? [sourceFile] : [];
    });
  }

  for (const sourceFile of sourceFiles) {
    const file = sourceFile.fileName;
    const visit = (node) => {
      const parseKind = getDateParseKind(node);
      const firstArgument = node.arguments?.[0];
      const hasSafeArity =
        parseKind === 'new Date' && (node.arguments?.length ?? 0) !== 1;
      if (
        parseKind !== null &&
        firstArgument &&
        !hasSafeArity &&
        !isSafeDateArgument(firstArgument)
      ) {
        const relativePath = relative(root, file).split(sep).join('/');
        const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        const line = position.line + 1;
        const kindId = parseKind === 'new Date' ? 'new-date' : 'date-parse';
        const body = `${relativePath}:${line} ${parseKind}`;
        records.push(
          createRecord(
            `date-only-parse:${relativePath}:${line}:${kindId}`,
            DATE_ONLY_GROUP_ID,
            DATE_ONLY_LABEL,
            body,
          ),
        );
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  return records;
}

export function renderRuleTargetResult(records) {
  if (records.length === 0) {
    return SUCCESS_OUTPUT;
  }

  const groups = new Map();
  for (const record of records) {
    let group = groups.get(record.groupId);
    if (!group) {
      group = {
        label: record.label,
        bodies: [],
        bodySet: new Set(),
      };
      groups.set(record.groupId, group);
    }
    if (!group.bodySet.has(record.body)) {
      group.bodySet.add(record.body);
      group.bodies.push(record.body);
    }
  }

  const report = [...groups.values()]
    .map((group) => `❌ [${group.label}]\n${group.bodies.join('\n')}`)
    .join('\n\n');
  return `NG: ${groups.size} rule violation(s) detected\n\n${report}\n\n`;
}

function createEngineFailureRecord(target) {
  if (target === 'challenge') {
    return createRecord(
      'challenge-engine-failure',
      'challenge-engine-failure',
      'UCFitness semantic rule engine failure',
      'challenge progress rule engine failed',
    );
  }
  if (target === 'date') {
    return createRecord(
      'date-engine-failure',
      'date-engine-failure',
      'UCFitness semantic rule engine failure',
      'timezone date-only rule engine failed',
    );
  }
  return createRecord(
    'rule-target-invocation-failure',
    'rule-target-invocation-failure',
    'UCFitness semantic rule engine failure',
    'semantic rule target invocation failed',
  );
}

export async function runRuleTargetsCli(
  args,
  {
    cwd = process.cwd(),
    loadTypeScript = loadDefaultTypeScript,
    challengeEngine = checkChallengeProgressAuthLogBoundary,
    dateEngine = checkDateOnlyParse,
  } = {},
) {
  const [option, rootArgument] = args;
  let target = 'unknown';
  let records;
  let output;

  try {
    if (option === '--challenge-progress-auth-log-boundary-only') {
      target = 'challenge';
      records = await challengeEngine({
        root: rootArgument === undefined ? cwd : resolve(cwd, rootArgument),
      });
    } else if (
      option === '--date-only-parse-only' ||
      option === '--date-only-jst-end-boundary-only'
    ) {
      target = 'date';
      records = await dateEngine({
        scanRoot: rootArgument ?? '.',
        cwd,
        loadTypeScript,
      });
    } else {
      throw new Error('Unsupported rule target');
    }
    if (!Array.isArray(records)) {
      throw new Error('Invalid rule target result');
    }
    output = renderRuleTargetResult(records);
  } catch {
    records = [createEngineFailureRecord(target)];
    output = renderRuleTargetResult(records);
  }

  return {
    records,
    output,
    exitCode: records.length === 0 ? 0 : 1,
  };
}

const isMain =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const result = await runRuleTargetsCli(process.argv.slice(2));
  process.stdout.write(result.output);
  process.exitCode = result.exitCode;
}
