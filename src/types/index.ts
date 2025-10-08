/**
 * Type definitions for Code Analysis & Context Engineering MCP
 */

// Framework types
export type FrameworkType = "react" | "react-native" | "expo" | "vue3" | "nuxt3" | "node";
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
  | "vue-directives";

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
