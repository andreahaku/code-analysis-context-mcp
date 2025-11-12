# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an **MCP (Model Context Protocol) server** that provides deep codebase analysis and AI-optimized context generation for modern JavaScript/TypeScript frameworks. The server exposes 6 fully-implemented analysis tools through the MCP protocol to help AI assistants understand project architecture, detect patterns, analyze dependencies, and generate optimal context packs.

### Supported Frameworks & Technologies

**Web Frameworks:**
- React - Hooks, Context API, HOCs, Render Props, Compound Components
- Vue 3 - Composition API, SFCs, Composables, Pinia stores
- Nuxt 3/4 - Auto-imports, file-based routing, server routes (Nitro), layouts, middleware, plugins

**Mobile Frameworks:**
- React Native - React Navigation (Stack/Tab/Drawer), Platform-specific code, Native modules, Animations (Reanimated), Gesture handlers
- Expo - Expo Router, Expo SDK, File-based routing, Platform features (Camera, Location, Notifications)

**Backend Frameworks:**
- Fastify - Routes, plugins, hooks, decorators, JSON Schema validation
- PostgreSQL - Query patterns, parameterized queries, transactions
- Kafka - Producers, consumers, topics, error handling
- Alyxstream - Stream processing tasks, operators, windowing, Kafka integration

**UI Libraries:**
- Nuxt UI 4 - Component detection, theming patterns

**Test Frameworks:**
- Vitest - Vue/Nuxt testing with @vue/test-utils, @nuxt/test-utils
- Jest - React/React Native testing with Testing Library, Navigation mocks
- Playwright - E2E testing patterns

**State Management:**
- Pinia - Store detection, test generation with setActivePinia
- Context API - Provider patterns, hook-based state
- Zustand - Store pattern detection
- Redux - Action/reducer patterns

## Development Commands

```bash
# Build the project (required before testing)
npm run build

# Development with watch mode
npm run dev

# Run tests
npm test

# Watch mode for tests
npm run test:watch

# Lint
npm run lint

# Format code
npm run format
```

**Important**: Always run `npm run build` after making changes to test the MCP server, as it runs from `dist/index.js`.

## Architecture Overview

### Core Components

1. **MCP Server Entry Point** (`src/index.ts`)
   - Implements the Model Context Protocol using `@modelcontextprotocol/sdk`
   - Defines 6 tools as MCP endpoints with JSON schemas
   - Handles stdio transport for communication with MCP clients
   - Each tool maps to a handler function in `src/tools/`
   - **Token-optimized schemas**: Tool names and parameters use shortened forms (e.g., `arch` instead of `code_analyze_architecture`, `path` instead of `projectPath`)
   - **Parameter mapping layer** (`mapParams` function): Automatically translates short parameter names to long names expected by tool handlers, maintaining backward compatibility

2. **AST Parser Service** (`src/services/ast-parser.ts`)
   - Multi-language parser supporting JS/TS/JSX/TSX and Vue SFC
   - Uses `@babel/parser` for JavaScript/TypeScript
   - Uses `@vue/compiler-sfc` for Vue Single File Components
   - **Key methods**:
     - `parseFile()` - Dispatches to appropriate parser based on file extension
     - `extractImports()` - Extracts import statements with specifiers
     - `extractExports()` - Identifies all exported symbols
     - `calculateComplexity()` - Computes cyclomatic complexity by counting decision points
     - `detectFrameworkPatterns()` - Identifies React hooks, Vue composables, etc.

3. **Framework Detector** (`src/utils/framework-detector.ts`)
   - Auto-detects project type from `package.json` dependencies and file structure
   - Returns framework type with confidence score (0-1) and evidence array
   - Provides framework-specific default globs for file discovery
   - **Detection priority**: Nuxt 3 → Vue 3 → Expo → React Native → Fastify → React → Node
   - Falls back to file structure analysis when `package.json` unavailable

4. **Architecture Analyzer** (`src/tools/architecture-analyzer.ts`)
   - Main analysis tool that orchestrates framework detection, file parsing, and metrics
   - Framework-specific analysis functions: `analyzeNuxt3()`, `analyzeVue3()`, `analyzeReactNative()`, `analyzeReact()`, `analyzeFastify()`
   - Generates Mermaid diagrams for architecture and data flow
   - **Recent feature**: Detailed per-file metrics including complexity, line counts, imports/exports, and patterns
   - Files in `detailedMetrics` are sorted by complexity (highest first) for easy hotspot identification

### Type System (`src/types/index.ts`)

Central type definitions for:
- `FrameworkType`: Supported frameworks
- `ArchitectureAnalysisResult`: Complete analysis output structure
- `ArchitectureAnalysisParams`: Tool input parameters
- `CodeMetrics` & `FileMetrics`: Aggregated and per-file metrics
- Framework-specific types: `HookInfo`, `ComposableInfo`, `StoreInfo`, `RouteInfo`

### Data Flow

```
MCP Client Request
  ↓
src/index.ts (MCP server handles tool call)
  ↓
src/tools/architecture-analyzer.ts
  ↓
FrameworkDetector.detect() → identifies framework
  ↓
ASTParser.parseFile() → parses each file, extracts imports/exports/complexity
  ↓
analyzeByFramework() → framework-specific analysis
  ↓
MermaidGenerator (optional) → generates diagrams
  ↓
Returns JSON result to MCP client
```

## Framework-Specific Analysis

Each framework has a dedicated analysis function that:
- Identifies characteristic layers/directories
- Detects framework patterns (hooks, composables, stores)
- Analyzes state management approach
- Recognizes navigation patterns
- Provides framework-specific recommendations

**Nuxt 3/4 specifics**:
- Detects auto-imported composables and components
- Identifies Pinia stores in `stores/` directory
- Recognizes file-based routing from `pages/`
- Detects server routes in `server/` directory (Nitro engine)
- Identifies middleware, layouts, and plugins
- Recognizes Nuxt UI 4 component usage

**Vue 3 specifics**:
- Detects Composition API usage (ref, reactive, computed, watch)
- Identifies Vue composables (functions starting with `use`)
- Recognizes provide/inject patterns
- Detects Vue-specific directives
- Identifies Pinia stores

**React specifics**:
- Counts custom hooks (functions starting with `use`)
- Detects Context API usage and providers
- Identifies HOCs (Higher-Order Components)
- Recognizes Render Props patterns
- Detects Compound Components

**React Native/Expo specifics**:
- Recognizes React Navigation setup (Stack/Tab/Drawer/Native navigators)
- Detects navigation hooks (useNavigation, useRoute, useFocusEffect)
- Identifies Platform-specific code (Platform.OS, Platform.select)
- Recognizes Native module usage (NativeModules, NativeEventEmitter)
- Detects animation libraries (Reanimated, Animated API, worklets)
- Identifies gesture handlers (PanGestureHandler, TapGestureHandler)
- Recognizes permission requests (Permissions API, Expo Permissions)
- Detects storage patterns (AsyncStorage, MMKV, SecureStore)
- Identifies media APIs (Image picker, Camera, Video)

**Fastify Backend specifics**:
- Detects route definitions (fastify.get, fastify.post, etc.)
- Identifies plugin registrations (fastify.register)
- Recognizes lifecycle hooks (onRequest, preHandler, onResponse, etc.)
- Detects JSON Schema validation in routes
- Identifies PostgreSQL query patterns (.query() calls, parameterized queries)
- Recognizes Kafka producers and consumers (producer.send, consumer.subscribe)
- Detects Alyxstream tasks (Task(), operators, windowing functions)
- Analyzes backend architecture layers (Routes, Services, Models, Plugins, Messaging, Configuration)
- Identifies database integration patterns
- Recognizes stream processing pipelines

### Known Limitations of Backend Pattern Detection

**PostgreSQL Query Detection**:
- ✅ Detects `.query()` method calls
- ✅ Identifies query type (SELECT, INSERT, UPDATE, etc.)
- ✅ Recognizes parameterized queries ($1, $2, etc.)
- ✅ Handles multi-line template literals
- ❌ Transaction detection (BEGIN/COMMIT/ROLLBACK) not yet implemented
- ❌ Dynamic query construction may not be fully captured
- ❌ ORM queries (Prisma, TypeORM) not detected

**Kafka Pattern Detection**:
- ✅ Detects `producer.send()` and `consumer.subscribe()` calls
- ✅ Extracts topic names from arguments
- ❌ Error handling detection limited (try-catch requires parent node tracking)
- ❌ Dynamic topic names from variables not extracted
- ❌ Complex producer configurations may be partially detected

**Alyxstream Detection**:
- ✅ Detects `Task()` instantiation
- ✅ Identifies chained operators (map, filter, keyBy, etc.)
- ✅ Recognizes windowing functions
- ✅ Detects source types (fromKafka, fromArray, fromStream)
- ❌ Complex operator chains may not capture all methods
- ❌ Custom operators not automatically recognized

**Fastify Routes & Plugins**:
- ✅ Detects standard route definitions (fastify.get, post, etc.)
- ✅ Recognizes `fastify.route()` config objects
- ✅ Identifies plugin registrations
- ✅ Detects lifecycle hooks
- ❌ Dynamic route registration may not be captured
- ❌ Routes registered in separate files via require() may be missed

**Recommendations**:
- Use explicit, static patterns for better detection
- Avoid dynamic string construction for queries and topics
- Keep route definitions in dedicated route files
- Use consistent naming conventions (e.g., `*Producer`, `*Consumer`)

## Testing the MCP Server

After building, test the MCP server using an MCP client like Claude Desktop:

```json
{
  "mcpServers": {
    "code-analysis": {
      "command": "node",
      "args": ["/absolute/path/to/dist/index.js"]
    }
  }
}
```

The server communicates via stdio and returns JSON-formatted analysis results.

## Key Implementation Details

### Complexity Calculation
- Starts at 1 (base complexity)
- Increments for each decision point: `if`, `for`, `while`, `case`, `||`, `&&`, `catch`, ternary operators
- Recursively traverses the entire AST

### Per-File Metrics Feature
- Enabled by default with `details: true`
- Each file gets: `path`, `lines`, `complexity`, `exports`, `imports` count, `patterns` object
- Results sorted by complexity descending for quick hotspot identification
- Useful for refactoring prioritization and technical debt tracking

### Auto-Optimization for Large Projects
- Activates automatically when project has >100 files and no filtering params specified
- Applies smart defaults: `minCx: 10`, `maxFiles: 50`
- Reduces response size by 66-80% (15k → 3-5k tokens)
- Adds notification to `recommendations` array explaining the optimization
- User can override with explicit `minCx: 0` or `maxFiles: 999`
- Implementation: `src/tools/architecture-analyzer.ts:120-144`

### LLM Memory Integration
- `arch` tool can generate memory suggestions when `memSuggest: true`
- Suggests storing important insights, patterns, and configurations in LLM Memory MCP
- Supports three scopes: `global` (cross-project), `local` (project-specific), `committed` (version-controlled)
- Memory types: `insight` (architectural decisions), `pattern` (recurring patterns), `config` (conventions)
- Each suggestion includes title, text, tags, files, and confidence score
- Enables persistent project knowledge across AI assistant sessions

### Implemented Tools

All 6 MCP tools are fully implemented and production-ready:

1. **`arch`** (`src/tools/architecture-analyzer.ts`)
   - Framework detection and analysis for React, React Native, Expo, Vue 3, Nuxt 3/4
   - Detailed per-file metrics with complexity analysis
   - Mermaid diagram generation for architecture visualization
   - Auto-optimization for large projects (>100 files)
   - LLM memory integration suggestions

2. **`deps`** (`src/tools/dependency-mapper.ts`)
   - Builds complete dependency graph using AST parsing
   - Detects circular dependencies with DFS algorithm
   - Calculates coupling, cohesion, and stability metrics
   - Identifies hotspots (hubs, bottlenecks, god objects)
   - Generates Mermaid diagrams with styled nodes
   - Focus mode for analyzing specific modules

3. **`patterns`** (`src/tools/pattern-detector.ts`)
   - React patterns: Hooks, HOCs, Render Props, Compound Components, Context API
   - React Native/Expo patterns: Navigation, Platform-specific code, Native modules, Animations (Reanimated), Gestures, Permissions, Storage, Media APIs
   - Vue/Nuxt patterns: Composables, Pinia stores, Vue plugins, Directives, Nuxt modules/middleware
   - Common patterns: Data fetching, Error handling, Forms
   - Custom pattern detection across the project
   - Best practice comparison and improvement suggestions

4. **`coverage`** (`src/tools/coverage-analyzer.ts`)
   - Parses LCOV and JSON coverage reports (Jest, Vitest, Playwright)
   - Identifies untested files with complexity-based prioritization
   - Generates framework-specific test scaffolds:
     - React/React Native: Jest + React Testing Library + Navigation mocks
     - Vue/Nuxt: Vitest + @vue/test-utils + mockNuxtImport + Pinia testing
   - Includes test suggestions for components, hooks, composables, Pinia stores, and Nuxt server routes
   - Priority scoring based on complexity and criticality
   - **MCP response size enforcement**: Automatically ensures responses stay under 25k token limit with progressive optimization

5. **`conventions`** (`src/tools/convention-validator.ts`)
   - Auto-detects conventions from existing codebase (naming, imports, quotes)
   - Validates naming conventions (PascalCase, camelCase, kebab-case)
   - Framework-specific rules: React hooks, Vue composables, React Native screens/navigators
   - Import style validation (relative vs absolute, grouping)
   - Code style validation (quotes, semicolons)
   - Auto-fix suggestions with safety indicators
   - Consistency scoring with strengths/weaknesses analysis

6. **`context`** (`src/tools/context-pack-generator.ts`)
   - Token-optimized context generation for AI assistants
   - Task-based relevance scoring using TF-IDF
   - Framework-aware concept detection (React hooks, Vue composables, Nuxt auto-imports)
   - Pattern detection (hooks, composables, stores, navigation)
   - Convention extraction from codebase
   - Multiple output formats (Markdown, JSON, XML)
   - Configurable token budgets and optimization strategies
   - **MCP response size enforcement**: Automatically ensures responses stay under 25k token limit

### MCP Response Size Limits (`context` tool)

The `context` tool implements sophisticated automatic response optimization to comply with MCP's 25,000 token limit:

**Two Token Concepts:**
1. **Input Token Budget** (`tokens` parameter): Controls how much file content to include in analysis
2. **MCP Response Limit** (25,000 tokens): Hard protocol limit for the JSON response size

**Automatic Optimization Stages:**
When a response would exceed 18,000 tokens (safe threshold with 28% buffer for MCP gateway overhead), the tool automatically applies progressive reductions:

1. **Stage 1**: Remove formatted output (duplicates file contents) - saves ~30-50%
2. **Stage 2**: Truncate file contents proportionally - targets 70% of safe limit for files
3. **Stage 3**: Reduce number of files to most relevant 50% (minimum 5 files)
4. **Stage 4**: Simplify architecture details - remove structure, keep overview
5. **Stage 5**: Emergency reduction - return only top 3 files with 500 chars each

**Transparency:**
- All optimizations logged in `metadata.mcpOptimizations` array
- User-facing notification added to `suggestions` array
- `metadata.responseOptimized: true` flag set when auto-optimization occurs

**Example Error (Before Fix):**
```
Error: MCP tool "context" response (35071 tokens) exceeds maximum allowed tokens (25000)
Error: MCP tool "dispatch" response (26230 tokens) exceeds maximum allowed tokens (25000)
```

**After Fix:**
Response automatically optimized to ~16-18k tokens with clear notification of what was reduced.

**Recommended Usage:**
- For large projects, use specific `focus` areas to narrow scope
- Start with lower `tokens` budget (8000-12000) for initial exploration
- Increase incrementally if more detail needed
- Use multiple targeted calls instead of one large context dump

**Implementation:** `src/tools/context-pack-generator.ts:24-223`

### MCP Response Size Limits (`coverage` tool)

The `coverage` tool implements progressive response optimization similar to the `context` tool to comply with MCP's 25,000 token limit:

**Automatic Optimization Stages:**
When a response would exceed 18,000 tokens (safe threshold with buffer for MCP gateway overhead), the tool automatically applies progressive reductions:

1. **Stage 1**: Truncate test scaffolds to 300 chars - reduces large code templates
2. **Stage 2**: Truncate critical gaps scaffolds - optimizes high-priority items
3. **Stage 3**: Remove all scaffolds (keep descriptions only) - saves ~40-60%
4. **Stage 4**: Reduce critical gaps to top 10 - focuses on most important items
5. **Stage 5**: Simplify existing test patterns - removes verbose examples
6. **Stage 6**: Reduce gaps to top 20 - limits overall gap list
7. **Stage 7**: Remove all test suggestions - keeps only gap analysis
8. **Stage 8**: Emergency reduction - return only top 5 gaps with minimal data

**Transparency:**
- All optimizations logged in `metadata.mcpOptimizations` array
- User-facing notification added to `recommendations` array
- `metadata.responseOptimized: true` flag set when auto-optimization occurs

**Example Error (Before Fix):**
```
Error: MCP tool "dispatch" response (31259 tokens) exceeds maximum allowed tokens (25000)
```

**After Fix:**
Response automatically optimized to ~16-18k tokens with clear notification of what was reduced.

**Recommended Usage:**
- Use `page` and `pageSize` parameters for explicit pagination control
- Use `priority: "critical"` or `priority: "high"` to filter results upfront
- Set `suggestTests: false` to skip test scaffold generation for faster responses
- Use `cx: false` to skip complexity analysis if not needed

**Implementation:** `src/tools/coverage-analyzer.ts:239-404`

## Module System
- Uses ES modules (`"type": "module"` in package.json)
- All imports must include `.js` extension even for `.ts` files
- TypeScript compiles to `dist/` with Node16 module resolution
- Requires Node.js >= 18.0.0

## Key Dependencies
- `@modelcontextprotocol/sdk` - MCP protocol implementation
- `@babel/parser` - JavaScript/TypeScript parsing
- `@vue/compiler-sfc` - Vue Single File Component parsing
- `fast-glob` - Fast file pattern matching
- `graphlib`, `madge`, `dependency-cruiser` - Dependency analysis (used by stub tools)
