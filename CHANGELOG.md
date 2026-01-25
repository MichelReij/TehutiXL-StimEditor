# Changelog

All notable changes to this project will be documented in this file.

## [2.1.0] - 2026-01-25

### 🚀 Added

- **Auto-Discovery Stimuli System**:
  - Automatic detection of all image files in `/source/img/stimuli` folder
  - Scans folder on every application startup
  - Automatically adds new files with auto-incrementing IDs
  - Removes non-existent files from the list
  - Maintains alphabetical sorting of filenames
  - Preserves existing tag assignments during sync
  - Console logging for added/removed files
  - Uses Vite's `import.meta.glob` for build-time file discovery

### 🔧 Changed

- **Stimulus Loading**:
  - Removed hardcoded `initialStimuli` array (670+ lines)
  - `readStimuli()` now deprecated in favor of `autoDiscoverStimuli()`
  - `init()` function now async to support file discovery
  - Stimuli list always stays in sync with filesystem

### 🗑️ Removed

- Removed hardcoded stimulus definitions
- Removed manual stimulus management burden

### 📝 Technical Details

- Added `types: ["vite/client"]` to tsconfig.json for Vite API support
- Uses `import.meta.glob` with `query: "?url"` pattern
- Synchronizes localStorage with filesystem on every startup

---

## [2.0.0] - 2026-01-25

### 🚀 Added

- **Modern Build System**: Migrated from CodeKit to Vite
  - TypeScript compilation with ES2020 target
  - SCSS preprocessing with modern Sass compiler
  - Hot Module Replacement (HMR) for development
  - Optimized production builds with code splitting

- **Data Backup/Restore**:
  - Export complete dataset as JSON with timestamp
  - Import dataset from JSON file
  - Visual buttons in toolbar with clear styling
  - Data validation on import

- **Enhanced TypeScript Types**:
  - Created dedicated `types.ts` module
  - Strict type definitions for all interfaces
  - Type guards for runtime validation
  - Improved type safety throughout codebase
  - Changed from `var` to `let/const` for better scoping

- **Documentation**:
  - Comprehensive README.md with installation and usage instructions
  - Detailed API documentation for data structures
  - Troubleshooting guide
  - Development workflow documentation

- **Version Control**:
  - Added `.gitignore` for Node.js/TypeScript projects
  - Excludes node_modules, build artifacts, and IDE files
  - Legacy CodeKit config excluded

### 🔧 Changed

- **Build Configuration**:
  - Updated `package.json` with new npm scripts
  - Configured Vite for TypeScript and SCSS
  - PostCSS config migrated to ES modules
  - Tailwind CSS config updated for Vite

- **Code Organization**:
  - Separated type definitions into dedicated module
  - Better organization with clear section comments
  - Cleaner global scope exposure for HTML handlers
  - Improved initialization flow

- **Asset Paths**:
  - Updated image paths for Vite's asset handling
  - Changed from relative to absolute paths
  - Proper handling of img directory as public assets

### 🗑️ Removed

- **Legacy Dependencies**:
  - Removed CodeKit-specific configurations
  - Cleaned up unused example JSON data
  - Removed redundant event listeners

### 📦 Dependencies

**Added**:
- `vite@^5.0.12` - Modern build tool
- `typescript@^5.3.3` - TypeScript compiler
- `sass@^1.70.0` - SCSS preprocessing
- `postcss@^8.4.33` - CSS post-processing
- `tailwindcss@^3.4.1` - Utility CSS framework
- `@types/node@^20.11.5` - Node.js type definitions

**Moved to devDependencies**:
- `autoprefixer` - Now a dev dependency

### 🐛 Fixed

- TypeScript strict mode compliance
- Module resolution for ES modules
- CSS injection via JavaScript import
- Event handler exposure to global scope

### 📝 Notes

This is a major rewrite that modernizes the entire development workflow. The application functionality remains the same, but the development experience and code quality have been significantly improved.

---

## [1.0.0] - Previous

Initial version with CodeKit build system.
