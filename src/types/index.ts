/**
 * Type definitions for Code Analysis & Context Engineering MCP
 */

// Framework types
export type FrameworkType = "react" | "react-native" | "expo" | "vue3" | "nuxt3" | "fastify" | "node";
export type StructureType = "monolithic" | "modular" | "feature-based" | "layers";
export type AnalysisDepth = "overview" | "detailed" | "deep";

// Analysis types
export type AnalyzeType =
  | "components"
  | "hooks"
  | "composables"
  | "providers"
  | "stores"
  | "navigation"
  | "state-management"
  | "data-flow"
  | "api-clients"
  | "server-routes"
  | "middleware"
  | "plugins"
  | "layouts";

// Pattern types
export type PatternType =
  | "hooks"
  | "hoc"
  | "render-props"
  | "compound-components"
  | "providers"
  | "custom-hooks"
  | "navigation"
  | "forms"
  | "data-fetching"
  | "error-handling"
  | "testing"
  | "composables"
  | "pinia-stores"
  | "vue-plugins"
  | "nuxt-modules"
  | "nuxt-middleware"
  | "nuxt-server-routes"
  | "vue-directives"
  // React Native mobile patterns
  | "rn-navigation"
  | "rn-platform-specific"
  | "rn-native-modules"
  | "rn-animations"
  | "rn-permissions"
  | "rn-storage"
  | "rn-gestures"
  | "rn-media"
  | "rn-deep-linking"
  // Backend Fastify patterns
  | "fastify-routes"
  | "fastify-plugins"
  | "fastify-hooks"
  | "fastify-decorators"
  | "fastify-schemas"
  // Database patterns
  | "postgres-queries"
  | "postgres-migrations"
  | "postgres-connection"
  // Messaging patterns
  | "kafka-producers"
  | "kafka-consumers"
  | "kafka-topics"
  // Stream processing patterns (Alyxstream)
  | "alyxstream-tasks"
  | "alyxstream-operators"
  | "alyxstream-windows";

// State management patterns
export type StateManagementPattern = "context" | "redux" | "zustand" | "mobx" | "pinia" | "vuex" | "mixed";

// Navigation patterns
export type NavigationPattern = "stack" | "tab" | "drawer" | "mixed" | "file-based";

// Project configuration
export interface ProjectConfig {
  name: string;
  type: FrameworkType;
  framework?: string;
  version?: string;
  structure: StructureType;
  nuxtConfig?: {
    layers?: string[];
    modules?: string[];
    autoImports?: boolean;
    typescript?: boolean;
  };
}

// Architecture layer
export interface ArchitectureLayer {
  name: string;
  description: string;
  directories: string[];
  dependencies: string[];
}

// Core module
export interface CoreModule {
  name: string;
  path: string;
  purpose: string;
  exports: string[];
  dependencies: string[];
}

// Component info
export interface ComponentInfo {
  total: number;
  byType: Record<string, number>;
  screens?: string[];
  reusable?: string[];
  layout?: string[];
}

// Hook/Composable pattern
export interface HookPattern {
  name: string;
  usage: string[];
  purpose: string;
  dependencies?: string[];
}

export interface ComposablePattern extends HookPattern {
  dependencies: string[];
}

// Hook/Composable info
export interface HookInfo {
  total: number;
  custom: string[];
  patterns: HookPattern[];
}

export interface ComposableInfo {
  total: number;
  custom: string[];
  autoImported?: boolean;
  patterns: ComposablePattern[];
}

// State management
export interface ProviderInfo {
  name: string;
  path: string;
  state: string[];
  actions: string[];
}

export interface StoreInfo {
  name: string;
  path: string;
  state: string[];
  getters: string[];
  actions: string[];
}

export interface StateManagementInfo {
  pattern: StateManagementPattern;
  providers?: ProviderInfo[];
  stores?: StoreInfo[];
  flow: string;
}

// Navigation
export interface RouteInfo {
  name: string;
  component: string;
  path?: string;
  params?: string[];
  middleware?: string[];
  layout?: string;
}

export interface NuxtPagesInfo {
  pagesDir: string;
  layoutsDir: string;
  middlewareDir: string;
  routingStrategy: "file-based" | "custom";
}

export interface NavigationInfo {
  pattern?: NavigationPattern;
  routes: RouteInfo[];
  nuxtPages?: NuxtPagesInfo;
}

// Server routes (Nuxt)
export interface ServerRouteInfo {
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  file: string;
  handler: string;
}

export interface ServerRoutesInfo {
  total: number;
  routes: ServerRouteInfo[];
}

// Metrics
export interface CodeMetrics {
  totalFiles: number;
  totalLines: number;
  avgComplexity: number;
  maxComplexity: number;
  testCoverage?: number;
  detailedMetrics?: FileMetrics[];
}

// Detailed per-file metrics
export interface FileMetrics {
  path: string;
  lines: number;
  complexity: number;
  exports: string[];
  imports: number;
  patterns: {
    isReact: boolean;
    isVue: boolean;
    hasHooks: boolean;
    hasComposables: boolean;
    isReactNative: boolean;
    reactNativePatterns?: {
      hasNavigation: boolean;
      hasPlatformSpecific: boolean;
      hasNativeModules: boolean;
      hasAnimations: boolean;
      hasAsyncStorage: boolean;
      navigationHooks: string[];
      animationLibraries: string[];
    };
  };
}

// Diagrams
export interface DiagramInfo {
  architecture?: string;
  dependencies?: string;
  dataFlow?: string;
}

// LLM Memory suggestion for storing analysis results
export interface MemorySuggestion {
  scope: "global" | "local" | "committed";
  type: "insight" | "pattern" | "fact" | "config";
  title: string;
  text: string;
  tags: string[];
  files?: string[];
  confidence?: number;
}

// Architecture analysis result
export interface ArchitectureAnalysisResult {
  project: ProjectConfig;
  architecture: {
    layers: ArchitectureLayer[];
    entryPoints: string[];
    coreModules: CoreModule[];
  };
  components: ComponentInfo;
  hooks?: HookInfo;
  composables?: ComposableInfo;
  stateManagement: StateManagementInfo;
  navigation: NavigationInfo;
  serverRoutes?: ServerRoutesInfo;
  dataFlow: {
    description: string;
    diagram?: string;
  };
  metrics: CodeMetrics;
  diagrams: DiagramInfo;
  recommendations: string[];
  memorySuggestions?: MemorySuggestion[];
  // React Native specific fields
  reactNative?: ReactNativeArchitectureExtension;
}

// Tool parameters
export interface ArchitectureAnalysisParams {
  projectPath?: string;
  includeGlobs?: string[];
  excludeGlobs?: string[];
  depth?: AnalysisDepth;
  analyzeTypes?: AnalyzeType[];
  generateDiagrams?: boolean;
  includeMetrics?: boolean;
  includeDetailedMetrics?: boolean;
  minComplexity?: number;
  maxDetailedFiles?: number;
  generateMemorySuggestions?: boolean;
  detectFramework?: boolean;
  framework?: FrameworkType;
}

// AST Node types
export interface ASTNode {
  type: string;
  start: number;
  end: number;
  loc?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  [key: string]: any;
}

// File analysis result
export interface FileAnalysisResult {
  path: string;
  framework: FrameworkType;
  exports: string[];
  imports: Array<{
    source: string;
    specifiers: string[];
  }>;
  components?: string[];
  hooks?: string[];
  composables?: string[];
  complexity: number;
}

// Dependency graph
export interface DependencyNode {
  id: string;
  path: string;
  type: "component" | "hook" | "utility" | "provider" | "service" | "composable" | "store";
  exports: string[];
  metrics: {
    inDegree: number;
    outDegree: number;
    centrality: number;
  };
}

export interface DependencyEdge {
  from: string;
  to: string;
  type: "import" | "require" | "dynamic";
  imports: string[];
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
}

// Pattern Analysis types
export interface PatternOccurrence {
  name: string;
  file: string;
  line?: number;
  type: PatternType;
  confidence: number;
  description: string;
}

export interface HOCPattern {
  name: string;
  file: string;
  wrappedComponent?: string;
  enhancedProps?: string[];
}

export interface RenderPropsPattern {
  name: string;
  file: string;
  renderProp: string;
  parameters?: string[];
}

export interface CompoundComponentPattern {
  parent: string;
  children: string[];
  file: string;
  sharedState?: string[];
}

export interface PiniaStorePattern {
  name: string;
  file: string;
  state: string[];
  getters: string[];
  actions: string[];
  usageCount: number;
}

export interface VuePluginPattern {
  name: string;
  file: string;
  installFn: boolean;
  provides?: string[];
}

export interface NuxtModulePattern {
  name: string;
  file: string;
  setup: boolean;
  hooks?: string[];
}

// Backend Fastify patterns
export interface FastifyRoutePattern {
  name: string;
  file: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS" | "HEAD";
  path: string;
  hasSchema?: boolean;
  hasHooks?: boolean;
}

export interface FastifyPluginPattern {
  name: string;
  file: string;
  isAsync: boolean;
  decorates?: string[];
}

export interface FastifyHookPattern {
  name: string;
  file: string;
  hookType: "onRequest" | "preParsing" | "preValidation" | "preHandler" | "preSerialization" | "onSend" | "onResponse" | "onError" | "onTimeout";
  scope?: "global" | "route";
}

// Database patterns
export interface PostgresQueryPattern {
  file: string;
  line?: number;
  queryType: "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "CREATE" | "ALTER" | "DROP" | "other";
  usesParameterized: boolean;
  hasTransaction?: boolean;
}

// Messaging patterns
export interface KafkaProducerPattern {
  name: string;
  file: string;
  topics: string[];
  hasErrorHandling: boolean;
}

export interface KafkaConsumerPattern {
  name: string;
  file: string;
  topics: string[];
  groupId?: string;
  hasErrorHandling: boolean;
}

// Stream processing patterns (Alyxstream)
export interface AlyxstreamTaskPattern {
  name: string;
  file: string;
  source: "kafka" | "array" | "stream" | "custom";
  operators: string[];
  hasWindowing: boolean;
  hasStorage: boolean;
}

export interface Antipattern {
  type: string;
  file: string;
  line?: number;
  severity: "error" | "warning" | "info";
  description: string;
  suggestion: string;
}

export interface BestPracticeComparison {
  pattern: string;
  status: "follows" | "deviates" | "unknown";
  details: string;
  suggestions?: string[];
}

export interface PatternAnalysisResult {
  project: {
    name: string;
    type: FrameworkType;
    totalFiles: number;
  };
  patterns: {
    hooks?: PatternOccurrence[];
    hocs?: HOCPattern[];
    renderProps?: RenderPropsPattern[];
    compoundComponents?: CompoundComponentPattern[];
    providers?: PatternOccurrence[];
    customHooks?: PatternOccurrence[];
    composables?: PatternOccurrence[];
    piniaStores?: PiniaStorePattern[];
    vuePlugins?: VuePluginPattern[];
    nuxtModules?: NuxtModulePattern[];
    nuxtMiddleware?: PatternOccurrence[];
    vueDirectives?: PatternOccurrence[];
    dataFetching?: PatternOccurrence[];
    errorHandling?: PatternOccurrence[];
    forms?: PatternOccurrence[];
    // React Native mobile patterns
    rnNavigation?: PatternOccurrence[];
    rnPlatformSpecific?: PatternOccurrence[];
    rnNativeModules?: PatternOccurrence[];
    rnAnimations?: PatternOccurrence[];
    rnPermissions?: PatternOccurrence[];
    rnStorage?: PatternOccurrence[];
    rnGestures?: PatternOccurrence[];
    rnMedia?: PatternOccurrence[];
    // Backend Fastify patterns
    fastifyRoutes?: FastifyRoutePattern[];
    fastifyPlugins?: FastifyPluginPattern[];
    fastifyHooks?: FastifyHookPattern[];
    // Database patterns
    postgresQueries?: PostgresQueryPattern[];
    // Messaging patterns
    kafkaProducers?: KafkaProducerPattern[];
    kafkaConsumers?: KafkaConsumerPattern[];
    // Stream processing patterns
    alyxstreamTasks?: AlyxstreamTaskPattern[];
  };
  customPatterns?: {
    name: string;
    occurrences: number;
    files: string[];
    description: string;
  }[];
  antipatterns?: Antipattern[];
  bestPractices?: BestPracticeComparison[];
  recommendations: string[];
  summary: {
    totalPatterns: number;
    byType: Record<string, number>;
    mostCommon: string[];
  };
}

export interface PatternAnalysisParams {
  projectPath?: string;
  patternTypes?: PatternType[];
  includeGlobs?: string[];
  excludeGlobs?: string[];
  detectCustomPatterns?: boolean;
  compareWithBestPractices?: boolean;
  suggestImprovements?: boolean;
  page?: number;
  pageSize?: number;
}

// Dependency Analysis types
export interface CircularDependency {
  cycle: string[];
  severity: "critical" | "warning";
  description: string;
}

export interface DependencyHotspot {
  file: string;
  inDegree: number;
  outDegree: number;
  centrality: number;
  type: "hub" | "bottleneck" | "god-object";
  description: string;
}

export interface DependencyMetrics {
  totalModules: number;
  avgDependencies: number;
  maxDependencies: number;
  coupling: number; // Afferent + Efferent coupling
  cohesion: number; // LCOM metric
  stability: number; // Ce / (Ca + Ce)
  abstractness?: number;
  distance?: number; // Distance from main sequence
}

export interface DependencyAnalysisResult {
  project: {
    name: string;
    totalFiles: number;
  };
  graph: DependencyGraph;
  circularDependencies: CircularDependency[];
  metrics: DependencyMetrics;
  hotspots: DependencyHotspot[];
  diagram?: string;
  recommendations: string[];
  summary: {
    totalDependencies: number;
    averageDepth: number;
    isolatedModules: number;
    circularCount: number;
    autoOptimized?: boolean;
    displayedNodes?: number;
    displayedEdges?: number;
  };
}

export interface DependencyAnalysisParams {
  projectPath?: string;
  includeGlobs?: string[];
  excludeGlobs?: string[];
  depth?: number;
  detectCircular?: boolean;
  calculateMetrics?: boolean;
  generateDiagram?: boolean;
  focusModule?: string;
  includeExternal?: boolean;
  page?: number;
  pageSize?: number;
}

// Context Pack Generation types
export type TaskType = "feature" | "bug" | "refactor" | "investigation" | "documentation" | "general";
export type OptimizationStrategy = "relevance" | "breadth" | "depth";

export interface TaskAnalysis {
  type: TaskType;
  keywords: string[];
  mentionedFiles: string[];
  frameworkConcepts: string[]; // hooks, composables, stores, etc.
  domainConcepts: string[]; // auth, payment, user, api, etc.
  actionVerbs: string[]; // add, fix, refactor, implement, etc.
}

export interface FileRelevance {
  path: string;
  score: number;
  reasons: string[];
  tokens: number;
  complexity?: number;
  lastModified?: Date;
}

export interface ContextFile {
  path: string;
  relevanceScore: number;
  reasons: string[];
  content: string;
  lineNumbers: boolean;
  truncated: boolean;
  tokenCount: number;
  category: "primary" | "dependency" | "test" | "type" | "architecture";
}

export interface TokenBudget {
  max: number;
  used: number;
  remaining: number;
  breakdown: {
    architecture: number;
    relevantFiles: number;
    dependencies: number;
    tests: number;
    types: number;
  };
}

export interface ContextPackResult {
  task: string;
  taskAnalysis: TaskAnalysis;
  strategy: OptimizationStrategy;
  tokenBudget: TokenBudget;
  architecture?: {
    framework: string;
    structure: string;
    stateManagement: string;
    navigation: string;
    overview: string;
  };
  files: ContextFile[];
  relatedTests: string[];
  conventions: string[];
  patterns: string[];
  suggestions: string[];
  formattedOutput: string;
  metadata: {
    totalFilesAnalyzed: number;
    filesIncluded: number;
    avgRelevanceScore: number;
    generatedAt: string;
    responseOptimized?: boolean;
    mcpOptimizations?: string[];
  };
}

export interface ContextPackParams {
  task: string;
  projectPath?: string;
  maxTokens?: number;
  includeTypes?: Array<
    | "relevant-files"
    | "dependencies"
    | "tests"
    | "types"
    | "architecture"
    | "conventions"
    | "related-code"
    | "composables"
    | "stores"
    | "server-routes"
    | "nuxt-config"
  >;
  focusAreas?: string[];
  includeHistory?: boolean;
  format?: "markdown" | "json" | "xml";
  includeLineNumbers?: boolean;
  optimizationStrategy?: OptimizationStrategy;
}

// Coverage Analysis types
export type TestFramework = "jest" | "vitest" | "playwright" | "mocha" | "ava";
export type CoverageFormat = "lcov" | "json" | "clover";
export type GapPriority = "critical" | "high" | "medium" | "low";
export type FileCriticality = "core" | "important" | "standard" | "peripheral";

export interface CoverageThreshold {
  lines?: number;
  functions?: number;
  branches?: number;
  statements?: number;
}

export interface FileCoverage {
  path: string;
  lines: {
    total: number;
    covered: number;
    percentage: number;
    uncovered: number[];
  };
  functions: {
    total: number;
    covered: number;
    percentage: number;
    uncovered: string[];
  };
  branches: {
    total: number;
    covered: number;
    percentage: number;
  };
  statements: {
    total: number;
    covered: number;
    percentage: number;
  };
}

export interface CoverageGap {
  file: string;
  priority: GapPriority;
  criticality: FileCriticality;
  complexity: number;
  coverage: {
    lines: number;
    functions: number;
    branches: number;
    statements: number;
  };
  reasons: string[];
  untestedFunctions: Array<{
    name: string;
    line?: number;
    complexity: number;
  }>;
  untestedLines: number[];
  testSuggestions: TestSuggestion[];
}

export interface TestSuggestion {
  type: "unit" | "integration" | "component" | "hook" | "composable" | "store" | "server-route" | "e2e";
  framework: TestFramework;
  testFilePath: string;
  scaffold: string;
  description: string;
  priority: GapPriority;
  estimatedEffort: "low" | "medium" | "high";
}

export interface ExistingTestPattern {
  framework: TestFramework;
  patterns: {
    importStatements: string[];
    setupPatterns: string[];
    assertionLibrary: string; // expect, assert, etc.
    mockingLibrary?: string; // vi.mock, jest.mock, etc.
    renderFunction?: string; // render, mount, etc.
    commonHelpers: string[];
  };
  exampleFiles: string[];
}

export interface CoverageAnalysisResult {
  project: {
    name: string;
    totalFiles: number;
    framework: FrameworkType;
  };
  summary: {
    overallCoverage: {
      lines: number;
      functions: number;
      branches: number;
      statements: number;
    };
    testedFiles: number;
    untestedFiles: number;
    partiallyTestedFiles: number;
    testFramework?: TestFramework;
  };
  threshold?: CoverageThreshold;
  gaps: CoverageGap[];
  criticalGaps: CoverageGap[];
  existingTestPatterns?: ExistingTestPattern;
  recommendations: string[];
  metadata: {
    coverageReportPath?: string;
    analyzedAt: string;
    gapsAboveThreshold: number;
    autoOptimized?: boolean;
  };
}

export interface CoverageAnalysisParams {
  projectPath?: string;
  coverageReportPath?: string;
  framework?: TestFramework;
  threshold?: CoverageThreshold;
  priority?: GapPriority | "all";
  includeGlobs?: string[];
  excludeGlobs?: string[];
  suggestTests?: boolean;
  analyzeComplexity?: boolean;
  page?: number;
  pageSize?: number;
}

// Convention Validation types
export type ConventionCategory =
  | "naming"
  | "structure"
  | "imports"
  | "exports"
  | "style"
  | "framework-specific";

export type ViolationSeverity = "error" | "warning" | "info";

export type CasingStyle = "PascalCase" | "camelCase" | "kebab-case" | "snake_case" | "SCREAMING_SNAKE_CASE";

export type ImportStyle = "relative" | "absolute" | "mixed";
export type QuoteStyle = "single" | "double" | "mixed";

export interface NamingConvention {
  pattern: string; // Regex pattern or special keywords like "PascalCase"
  description: string;
  examples?: string[];
  exceptions?: string[]; // File patterns that are exempt
}

export interface FileStructureConvention {
  directory: string;
  allowedExtensions: string[];
  namingPattern?: string;
  required?: boolean; // Must exist
  description: string;
}

export interface ImportConvention {
  order?: string[]; // e.g., ["external", "internal", "relative"]
  grouping?: boolean; // Group imports by type
  style?: ImportStyle;
  aliases?: Record<string, string>; // e.g., "@/*": "src/*"
  noCircular?: boolean;
}

export interface StyleConvention {
  quotes?: QuoteStyle;
  semicolons?: boolean;
  trailingCommas?: boolean;
  indentation?: "tabs" | "spaces";
  indentSize?: number;
}

export interface ProjectConventions {
  naming?: {
    components?: NamingConvention;
    hooks?: NamingConvention;
    composables?: NamingConvention;
    utilities?: NamingConvention;
    constants?: NamingConvention;
    types?: NamingConvention;
    files?: NamingConvention;
    directories?: NamingConvention;
  };
  structure?: {
    directories?: FileStructureConvention[];
    fileOrganization?: string; // "feature-based" | "layer-based" | "domain-based"
  };
  imports?: ImportConvention;
  style?: StyleConvention;
  framework?: {
    [key: string]: any; // Framework-specific rules
  };
}

export interface ConventionViolation {
  file: string;
  line?: number;
  column?: number;
  category: ConventionCategory;
  severity: ViolationSeverity;
  rule: string;
  message: string;
  expected?: string;
  actual?: string;
  autoFixable?: boolean;
  autoFix?: AutoFix;
}

export interface AutoFix {
  type: "rename" | "reorder" | "replace" | "insert" | "delete";
  description: string;
  currentValue?: string;
  newValue?: string;
  safe: boolean; // Safe to apply automatically
  preview?: string; // Preview of the fix
}

export interface DetectedConvention {
  category: ConventionCategory;
  rule: string;
  pattern: string;
  confidence: number; // 0-1
  occurrences: number;
  examples: string[];
}

export interface ConsistencyScore {
  overall: number; // 0-100
  byCategory: Record<ConventionCategory, number>;
  strengths: string[];
  weaknesses: string[];
}

export interface ConventionValidationResult {
  project: {
    name: string;
    framework: FrameworkType;
    totalFiles: number;
  };
  detectedConventions?: DetectedConvention[];
  conventions: ProjectConventions;
  violations: ConventionViolation[];
  consistency: ConsistencyScore;
  summary: {
    totalViolations: number;
    byCategory: Record<ConventionCategory, number>;
    bySeverity: Record<ViolationSeverity, number>;
    autoFixableCount: number;
  };
  autoFixSuggestions?: AutoFixSuggestion[];
  recommendations: string[];
  metadata: {
    analyzedAt: string;
    filesAnalyzed: number;
  };
}

export interface AutoFixSuggestion {
  category: ConventionCategory;
  severity: ViolationSeverity;
  affectedFiles: string[];
  description: string;
  fixes: AutoFix[];
  estimatedImpact: "low" | "medium" | "high";
  safe: boolean;
}

export interface ConventionValidationParams {
  projectPath?: string;
  includeGlobs?: string[];
  excludeGlobs?: string[];
  conventions?: ProjectConventions;
  autodetectConventions?: boolean;
  severity?: ViolationSeverity; // Minimum severity to report
  autoFix?: boolean; // Generate auto-fix suggestions
  applyAutoFixes?: boolean; // Actually apply safe fixes
  framework?: FrameworkType;
  page?: number;
  pageSize?: number;
}

// ====================== React Native Mobile-Specific Types ======================

// React Native Navigation types
export type NavigatorType = "stack" | "tab" | "drawer" | "bottom-tab" | "material-top-tab" | "native-stack";

export interface NavigatorInfo {
  name: string;
  type: NavigatorType;
  file: string;
  screens: ScreenInfo[];
  options?: Record<string, any>;
}

export interface ScreenInfo {
  name: string;
  component: string;
  file: string;
  route?: string;
  params?: string[];
  options?: Record<string, any>;
}

export interface ReactNativeNavigationInfo extends NavigationInfo {
  navigators?: NavigatorInfo[];
  screens?: ScreenInfo[];
  deepLinking?: {
    enabled: boolean;
    prefixes?: string[];
    config?: Record<string, any>;
  };
  navigationContainer?: {
    file: string;
    theme?: "light" | "dark" | "custom";
  };
}

// Platform-specific file information
export interface PlatformSpecificFile {
  baseName: string; // e.g., "Component"
  baseFile?: string; // Component.tsx (if exists)
  iosFile?: string; // Component.ios.tsx
  androidFile?: string; // Component.android.tsx
  nativeFile?: string; // Component.native.tsx
  webFile?: string; // Component.web.tsx
  directory: string;
}

export interface PlatformInfo {
  hasPlatformSpecificFiles: boolean;
  platformFiles: PlatformSpecificFile[];
  platformChecks: Array<{
    file: string;
    line: number;
    type: "Platform.OS" | "Platform.select" | "Platform.Version";
    platforms: string[];
  }>;
}

// Native Module information
export interface NativeModuleInfo {
  name: string;
  file: string;
  namespace: string; // e.g., "NativeModules.MyModule"
  methods: string[];
  usageCount: number;
  isTurboModule: boolean;
}

export interface NativeModulesInfo {
  total: number;
  modules: NativeModuleInfo[];
  turboModules: number;
}

// Animation patterns
export interface AnimationPattern {
  type: "Animated" | "Reanimated" | "LayoutAnimation" | "native-driver";
  file: string;
  line?: number;
  animatedValues: string[];
  worklets?: string[]; // For Reanimated
}

export interface AnimationInfo {
  total: number;
  byType: Record<string, number>;
  patterns: AnimationPattern[];
  usesNativeDriver: boolean;
  usesReanimated: boolean;
}

// Permission patterns
export interface PermissionUsage {
  type: "camera" | "location" | "notifications" | "contacts" | "photos" | "microphone" | "storage" | "other";
  file: string;
  line?: number;
  library: string; // e.g., "react-native-permissions", "expo-permissions"
  requestMethod: string;
}

export interface PermissionsInfo {
  total: number;
  byType: Record<string, number>;
  permissions: PermissionUsage[];
  libraries: string[];
}

// Storage patterns
export interface StoragePattern {
  type: "AsyncStorage" | "MMKV" | "SecureStore" | "Realm" | "WatermelonDB" | "SQLite" | "other";
  file: string;
  line?: number;
  operations: Array<"get" | "set" | "remove" | "clear">;
}

export interface StorageInfo {
  total: number;
  byType: Record<string, number>;
  patterns: StoragePattern[];
  encrypted: boolean;
}

// React Native specific architecture result extension
export interface ReactNativeArchitectureExtension {
  reactNativeVersion?: string;
  expoVersion?: string;
  isExpoManaged?: boolean;

  navigation?: ReactNativeNavigationInfo;
  nativeModules?: NativeModulesInfo;
  platformInfo?: PlatformInfo;
  animations?: AnimationInfo;
  permissions?: PermissionsInfo;
  storage?: StorageInfo;

  mobilePatterns?: {
    flatLists?: number;
    scrollViews?: number;
    touchables?: number;
    keyboards?: number;
    safeAreas?: number;
    modals?: number;
    bottomSheets?: number;
  };

  thirdPartyLibraries?: {
    navigation?: string[]; // @react-navigation/*, expo-router
    stateManagement?: string[]; // redux, zustand, jotai, recoil
    ui?: string[]; // react-native-paper, native-base, tamagui
    networking?: string[]; // axios, @tanstack/react-query
    forms?: string[]; // react-hook-form, formik
    animations?: string[]; // react-native-reanimated, lottie
    gestures?: string[]; // react-native-gesture-handler
    media?: string[]; // react-native-image-picker, expo-av
    maps?: string[]; // react-native-maps
  };
}
