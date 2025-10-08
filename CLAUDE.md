# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an **MCP (Model Context Protocol) server** that provides deep codebase analysis and AI-optimized context generation for React, React Native, Vue 3, and Nuxt 3 projects. The server exposes 6 analysis tools through the MCP protocol to help AI assistants understand project architecture, detect patterns, analyze dependencies, and generate optimal context packs.

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
   - **Detection priority**: Nuxt 3 → Vue 3 → Expo → React Native → React → Node
   - Falls back to file structure analysis when `package.json` unavailable

4. **Architecture Analyzer** (`src/tools/architecture-analyzer.ts`)
   - Main analysis tool that orchestrates framework detection, file parsing, and metrics
   - Framework-specific analysis functions: `analyzeNuxt3()`, `analyzeVue3()`, `analyzeReactNative()`, `analyzeReact()`
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

**Nuxt 3 specifics**:
- Detects auto-imported composables and components
- Identifies Pinia stores in `stores/` directory
- Recognizes file-based routing from `pages/`
- Detects server routes in `server/` directory
- Identifies middleware and layouts

**React/React Native specifics**:
- Counts custom hooks (functions starting with `use`)
- Detects Context API usage
- Identifies screen/component patterns
- Recognizes React Navigation setup

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
- Enabled by default with `includeDetailedMetrics: true`
- Each file gets: `path`, `lines`, `complexity`, `exports`, `imports` count, `patterns` object
- Results sorted by complexity descending for quick hotspot identification
- Useful for refactoring prioritization and technical debt tracking

### Auto-Optimization for Large Projects
- Activates automatically when project has >100 files and no filtering params specified
- Applies smart defaults: `minComplexity: 10`, `maxDetailedFiles: 50`
- Reduces response size by 66-80% (15k → 3-5k tokens)
- Adds notification to `recommendations` array explaining the optimization
- User can override with explicit `minComplexity: 0` or `maxDetailedFiles: 999`
- Implementation: `src/tools/architecture-analyzer.ts:120-144`

### Stub Tools
Five tools currently return placeholder data but have complete interfaces ready for implementation:
- `code_analyze_dependency_graph` - Uses `madge` and `dependency-cruiser`
- `code_analyze_patterns` - AST-based pattern matching
- `code_analyze_coverage_gaps` - Parses LCOV/JSON coverage reports
- `code_validate_conventions` - Naming and structure validation
- `code_generate_context_pack` - Token-optimized context building

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
