# Usage Guide - Code Analysis & Context Engineering MCP

## Quick Start

### Installation

The MCP server is now built and ready to use:

```bash
cd /Users/administrator/Development/Claude/code_context/code-analysis-context-mcp
npm install  # Already done
npm run build  # Already done
```

### Integration with Claude Desktop

Add this configuration to your Claude Desktop MCP settings file:

**Location**: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)

```json
{
  "mcpServers": {
    "code-analysis": {
      "command": "node",
      "args": [
        "/Users/administrator/Development/Claude/code_context/code-analysis-context-mcp/dist/index.js"
      ]
    }
  }
}
```

After adding this configuration:
1. Restart Claude Desktop
2. The MCP server will be available with 6 tools

## Available Tools

### 1. code_analyze_architecture

**Purpose**: Get comprehensive architectural overview of your codebase

**Example Usage**:
```
Please use the code_analyze_architecture tool to analyze my project at:
/Users/andreasalvatore/Development/VueJS/smartchat-webapp

Use detailed depth and analyze: components, composables, stores, navigation, server-routes
```

**What It Provides**:
- Project type detection (React/Vue/Nuxt)
- Architecture layers and dependencies
- Component counts and organization
- Composables/hooks analysis
- State management patterns (Pinia/Context)
- Navigation structure (file-based for Nuxt)
- Server routes (for Nuxt)
- Mermaid diagrams
- Code metrics

### 2. code_analyze_dependency_graph

**Purpose**: Visualize module dependencies and detect circular dependencies

**Example Usage**:
```
Use code_analyze_dependency_graph to analyze dependencies in my project,
detect circular dependencies, and generate a diagram.
```

**What It Provides**:
- Dependency graph visualization
- Circular dependency detection
- Coupling and cohesion metrics
- Module hotspots
- Architectural recommendations

### 3. code_analyze_patterns

**Purpose**: Detect framework-specific patterns and best practices

**Example Usage**:
```
Use code_analyze_patterns to find all composables, Pinia stores, and
Nuxt modules in my project. Compare against best practices.
```

**What It Provides**:
- Custom hooks/composables detection
- Provider/store patterns
- Framework-specific patterns
- Antipattern detection
- Best practice comparisons

### 4. code_analyze_coverage_gaps

**Purpose**: Find untested code and get test suggestions

**Example Usage**:
```
Use code_analyze_coverage_gaps to analyze my coverage report at
coverage/coverage-summary.json and suggest tests for high-priority gaps.

Use vitest as the framework.
```

**What It Provides**:
- Coverage summary
- Untested functions with complexity scores
- Test scaffolds
- Prioritized recommendations

### 5. code_validate_conventions

**Purpose**: Validate coding conventions and consistency

**Example Usage**:
```
Use code_validate_conventions to check my project conventions.
Auto-detect conventions from the existing codebase.
```

**What It Provides**:
- Detected naming conventions
- Violation reports
- Consistency score
- Auto-fix suggestions

### 6. code_generate_context_pack

**Purpose**: Build optimal AI context for a specific task

**Example Usage**:
```
Use code_generate_context_pack for this task:
"Add real-time WebSocket notifications with composables and Pinia store"

Include: relevant-files, architecture, composables, stores, conventions
Max tokens: 50000
```

**What It Provides**:
- Task-optimized file selection
- Architecture overview
- Project conventions
- Related code snippets
- Token usage optimization

## Real-World Examples

### Example 1: Onboarding to Nuxt 3 Project

```
Use code_analyze_architecture on my Nuxt 3 project at
/Users/andreasalvatore/Development/VueJS/smartchat-webapp

Analyze everything: components, composables, stores, layouts,
middleware, server-routes, navigation

Generate diagrams and include metrics.
```

**Result**: Complete architectural understanding in 2 minutes

### Example 2: Adding a New Feature

```
Use code_generate_context_pack for:
"Add user profile editing with avatar upload"

Project: /path/to/my/nuxt/app
Include: relevant-files, composables, stores, server-routes, conventions
```

**Result**: AI receives perfect context with all relevant patterns

### Example 3: Improving Test Coverage

```
Use code_analyze_coverage_gaps with:
- Coverage report: coverage/coverage-summary.json
- Framework: vitest
- Priority: high
- Suggest tests: true
```

**Result**: Prioritized list of gaps with test scaffolds

## Development Workflow Integration

### Before Starting Work

```
1. Analyze architecture to understand structure
2. Check conventions to follow patterns
3. Review patterns to match existing code
```

### While Coding

```
1. Generate context pack for your specific task
2. AI provides suggestions that match project style
3. Validate conventions as you go
```

### Before Committing

```
1. Validate conventions
2. Check coverage gaps
3. Analyze new dependencies
```

## Current Implementation Status

### ✅ Fully Implemented
- MCP server infrastructure
- Framework detection (React/RN/Vue/Nuxt)
- AST parsing (JS/TS/Vue SFC)
- Basic architecture analysis
- Mermaid diagram generation
- All 6 tool interfaces

### 🚧 Stub Implementations (To Be Enhanced)
- Dependency graph analysis
- Pattern detection
- Coverage analysis
- Convention validation
- Context pack optimization

These are currently returning placeholder data but the infrastructure
is in place to implement the full functionality.

## Next Steps for Development

### Phase 2: Pattern Detection
- Implement React hook detection
- Implement Vue composable analysis
- Add Pinia store parsing
- Detect Nuxt modules and middleware

### Phase 3: Coverage & Quality
- Parse coverage reports (lcov/JSON)
- Generate test scaffolds
- Convention auto-detection
- Auto-fix suggestions

### Phase 4: Context Optimization
- TF-IDF relevance scoring
- Token counting
- Dependency traversal
- Context formatting

## Troubleshooting

### Server Not Showing Up

1. Check Claude Desktop config file path
2. Verify node path is correct
3. Restart Claude Desktop completely
4. Check logs: `~/Library/Logs/Claude/`

### Build Errors

```bash
npm run build
```

If errors occur, check:
- Node version (>=18.0.0)
- TypeScript version
- Clean build: `rm -rf dist && npm run build`

### Testing Locally

```bash
# Run the server directly
node dist/index.js

# It should start without errors
```

## Configuration

Create `.code-analysis.json` in your project root:

```json
{
  "project": {
    "name": "MyProject",
    "type": "nuxt3"
  },
  "analysis": {
    "includeGlobs": [
      "components/**/*.vue",
      "composables/**/*.ts"
    ],
    "excludeGlobs": [
      "node_modules/**",
      ".nuxt/**"
    ]
  }
}
```

## Support

This is an early implementation based on the comprehensive specification.
The architecture is solid and ready for enhancement.

For issues or questions, refer to:
- `README.md` - Overview and features
- `MCP_IDEAS_CODE_ANALYSIS_CONTEXT_ENGINEERING.md` - Full specification
- Source code in `src/` directory

---

*Happy Coding! 🚀*
