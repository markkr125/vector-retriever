# SCSS Architecture Guide

This document describes the SCSS architecture and conventions used in the Vector Retriever Web UI.

## Table of Contents
- [Directory Structure](#directory-structure)
- [File Organization](#file-organization)
- [Available Variables](#available-variables)
- [Available Mixins](#available-mixins)
- [Coding Conventions](#coding-conventions)
- [Adding New Styles](#adding-new-styles)

## Directory Structure

```
web-ui/src/scss/
├── main.scss                    # Entry point (imports globals)
├── base/                        # Shared tokens & utilities
│   ├── _variables.scss          # Design tokens (colors, spacing, shadows)
│   ├── _mixins.scss             # Reusable patterns
│   ├── _globals.scss            # CSS custom properties (:root)
│   └── _animations.scss         # Shared keyframes (vr-* prefix)
└── components/                  # Component-specific styles
    ├── collections/             # Collection management
    │   └── CollectionSelector.scss
    ├── layout/                  # App shell & navigation
    │   └── App.scss
    ├── modals/                  # Modal dialogs
    │   ├── AnalysisProgressModal.scss
    │   ├── CollectionManagementModal.scss
    │   ├── PIIDetailsModal.scss
    │   ├── UploadModal.scss
    │   └── UploadProgressModal.scss
    ├── notifications/           # Toast & alerts
    │   └── ScanNotification.scss
    ├── results/                 # Results list (modular)
    │   ├── ResultsList.scss     # Entry point (@import all partials)
    │   ├── _ResultsContainer.scss
    │   ├── _ClusterView.scss
    │   ├── _BrowseControls.scss
    │   ├── _ResultCard.scss
    │   ├── _ResultTabs.scss
    │   ├── _Pagination.scss
    │   └── _Badges.scss
    ├── search/                  # Search form & facets
    │   ├── FacetBar.scss
    │   └── SearchForm.scss
    ├── sidebar/                 # Sidebar components
    │   └── FacetsSidebar.scss
    └── visualization/           # Charts & plots
        └── DocumentClusterView.scss
```

## File Organization

### Vue Component Integration

All Vue components reference external SCSS files:

```vue
<template>
  <!-- Component HTML -->
</template>

<script setup>
// Component logic
</script>

<style scoped lang="scss" src="@/scss/components/<domain>/ComponentName.scss"></style>
```

**NEVER** use inline `<style>` blocks with CSS/SCSS directly in Vue components.

### Auto-Injection

Variables and mixins are auto-injected into every SCSS file via Vite configuration:

```javascript
// vite.config.js
css: {
  preprocessorOptions: {
    scss: {
      additionalData: `
        @use "@/scss/base/_variables.scss" as *;
        @use "@/scss/base/_mixins.scss" as *;
      `
    }
  }
}
```

This means you can use `$color-primary`, `@include button-base()`, etc. without explicit imports.

## Available Variables

### Colors (Runtime - CSS Custom Properties)

| Variable | CSS Property | Description |
|----------|--------------|-------------|
| `$color-primary` | `--primary-color` | Brand primary |
| `$color-primary-hover` | `--primary-hover` | Primary hover state |
| `$color-secondary` | `--secondary-color` | Brand secondary (green) |
| `$color-secondary-hover` | `--secondary-hover` | Secondary hover state |
| `$color-bg` | `--background` | Page background |
| `$color-surface` | `--surface` | Card/panel background |
| `$color-text` | `--text-primary` | Primary text |
| `$color-text-muted` | `--text-secondary` | Secondary/muted text |
| `$color-border` | `--border-color` | Default borders |
| `$color-error` | `--error` | Error states |

### Colors (Compile-Time)

| Variable | Value | Description |
|----------|-------|-------------|
| `$color-white` | `#ffffff` | Pure white |
| `$color-black` | `#000000` | Pure black |
| `$color-warning` | `#ff9800` | Warning orange |
| `$color-warning-hover` | `#f57c00` | Warning hover |
| `$color-info` | `#3498db` | Info blue |
| `$color-info-hover` | `#2980b9` | Info hover |
| `$color-info-dark` | `#1e40af` | Info dark |
| `$color-danger-accent` | `#ff5722` | Danger/high risk |
| `$color-critical-accent` | `#d32f2f` | Critical/severe |
| `$color-primary-light` | `#dbeafe` | Light primary (backgrounds) |
| `$color-primary-lighter` | `#eff6ff` | Lighter primary |
| `$color-primary-dark` | `#1e40af` | Dark primary |
| `$color-error-light` | `#fee2e2` | Light error (backgrounds) |
| `$color-error-dark` | `#b91c1c` | Dark error |

### Status Backgrounds (Soft)

| Variable | Value | Use Case |
|----------|-------|----------|
| `$bg-success-soft` | `#f0fdf4` | Success banners |
| `$bg-warning-soft` | `#fff7ed` | Warning banners |
| `$bg-error-soft` | `#fef2f2` | Error banners |
| `$bg-info-soft` | `#eef2ff` | Info banners |
| `$text-success` | `#059669` | Success text |

### Border Radii

| Variable | Value | Use Case |
|----------|-------|----------|
| `$radius-sm` | `4px` | Small elements, tags |
| `$radius-md` | `6px` | Buttons, inputs |
| `$radius-lg` | `8px` | Cards, panels |
| `$radius-xl` | `12px` | Modals, large cards |
| `$radius-2xl` | `16px` | Hero sections |

### Shadows

| Variable | Source | Description |
|----------|--------|-------------|
| `$shadow-sm` | `--shadow-sm` | Subtle elevation |
| `$shadow-md` | `--shadow-md` | Cards, dropdowns |
| `$shadow-lg` | `--shadow-lg` | Modals, popovers |
| `$shadow-float` | Compile-time | Floating overlays |

### Gradients

| Variable | Value |
|----------|-------|
| `$gradient-brand` | `linear-gradient(135deg, #667eea 0%, #764ba2 100%)` |
| `$gradient-brand-soft` | Same with 12% opacity |

### Transitions

| Variable | Value | Use Case |
|----------|-------|----------|
| `$transition-fast` | `0.15s` | Quick interactions |
| `$transition` | `0.2s` | Default transitions |
| `$transition-slow` | `0.3s` | Emphasis animations |

### Z-Index Layers

| Variable | Value | Use Case |
|----------|-------|----------|
| `$z-dropdown` | `1000` | Dropdowns, popovers |
| `$z-modal` | `2000` | Modal overlays |
| `$z-toast` | `9999` | Toast notifications |

## Available Mixins

### Modal & Overlay

```scss
// Full-screen overlay with backdrop blur
@include modal-overlay($z: $z-modal, $bg: rgba(0,0,0,0.5), $blur: 4px);

// Modal panel styling
@include modal-panel($bg: $color-surface, $radius: $radius-xl, $shadow: $shadow-lg);

// Gradient header bar
@include panel-header($background: $gradient-brand, $padding: 1.5rem);
```

### Buttons

```scss
// Base button (no colors, just structure)
@include button-base($padding: 0.6rem 1.2rem, $radius: $radius-sm, $font-size: 0.9rem);

// Solid accent button with hover
@include accent-solid-button($bg: $color-secondary, $bg-hover: $color-secondary-hover);

// Subtle bordered button
@include subtle-bordered-button($padding: 0.25rem 0.5rem, $radius: $radius-md);

// Hover lift effect (translateY + shadow)
@include lift-hover($y: -2px, $shadow: 0 4px 12px rgba(0,0,0,0.15));
```

### Form Controls

```scss
// Input/select base styling
@include input-base($padding: 0.5rem 1rem, $radius: $radius-sm);

// Compact control (smaller padding)
@include control-compact($padding: 0.5rem, $radius: $radius-sm);

// Focus ring
@include focus-ring($ring-color: rgba(79, 70, 229, 0.2));
```

### Close Buttons

```scss
// Light close button (for light backgrounds)
@include close-button($size: 2rem, $font-size: 2rem, $radius: $radius-sm);

// Dark/inverse close button (for dark/gradient backgrounds)
@include close-button-inverse($size: 2rem, $font-size: 1.75rem, $radius: $radius-md);
```

### Scrollbars

```scss
// Custom scrollbar styling
@include scrollbars($size: 8px, $track: #f1f1f1, $thumb: #bdc3c7);
```

### Status Banners

```scss
// Info/success/warning/error banners
@include status-banner(
  $bg: $bg-info-soft,
  $border-color: $color-info,
  $text-color: $color-info,
  $border-left: false,  // or true for left-border style
  $border-size: 1px,
  $radius: $radius-md,
  $padding: 0.75rem
);
```

### Utilities

```scss
// Single-line text truncation
@include truncate-one-line;

// Accent border on hover
@include accent-border-hover($accent: $color-warning, $shadow-alpha: 0.2);
```

## Coding Conventions

### 1. Use SCSS Variables Instead of Hardcoded Values

```scss
// ❌ Bad
.element {
  color: #667eea;
  background: #f8f9fa;
  border-radius: 8px;
}

// ✅ Good
.element {
  color: $color-primary;
  background: $color-bg;
  border-radius: $radius-lg;
}
```

### 2. Use SCSS Nesting for Related Elements

```scss
// ❌ Bad (flat CSS)
.card { ... }
.card:hover { ... }
.card .card-title { ... }
.card .card-content { ... }

// ✅ Good (nested SCSS)
.card {
  ...
  
  &:hover {
    ...
  }
  
  .card-title {
    ...
  }
  
  .card-content {
    ...
  }
}
```

### 3. Use Mixins for Common Patterns

```scss
// ❌ Bad (repeated code)
.btn-primary {
  padding: 0.6rem 1.2rem;
  border: none;
  border-radius: 6px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
}

// ✅ Good (using mixin)
.btn-primary {
  @include button-base($radius: $radius-md);
  background: $color-primary;
  color: $color-white;
  
  &:hover {
    background: $color-primary-dark;
  }
}
```

### 4. Organize with Section Comments

```scss
// ========================
// Header Section
// ========================
.header { ... }

// ========================
// Navigation
// ========================
.nav { ... }

// ========================
// Content Area
// ========================
.content { ... }
```

### 5. Keep Nesting Shallow (Max 3-4 Levels)

```scss
// ❌ Bad (too deep)
.modal {
  .content {
    .form {
      .field {
        .input {
          .icon { ... }
        }
      }
    }
  }
}

// ✅ Good (flat with meaningful classes)
.modal-content { ... }
.modal-form { ... }
.form-field { ... }
.field-input { ... }
.input-icon { ... }
```

### 6. Animation Keyframes Use `vr-` Prefix

Shared keyframes in `_animations.scss` use the `vr-` prefix to avoid collisions:

```scss
// In _animations.scss
@keyframes vr-spin { ... }
@keyframes vr-pulse { ... }
@keyframes vr-shimmer { ... }
@keyframes vr-slide-down { ... }

// In component SCSS
.spinner {
  animation: vr-spin 1s linear infinite;
}
```

### 7. Never Use Deprecated Sass Features

**CRITICAL:** Do not use deprecated Sass features:

```scss
// ❌ FORBIDDEN - @import is deprecated
@import 'variables';
@import 'mixins';

// ✅ REQUIRED - Use @use with namespace
@use '../../base/variables' as *;
@use '../../base/mixins' as *;

// ✅ REQUIRED - Use @forward to re-export partials
@forward 'Partial';
```

**Why:** `@import` is deprecated in Dart Sass and will be removed in future versions. It also has scoping issues that `@use`/`@forward` solve.

**Pattern for modular files:**
- Partials (files starting with `_`) should include their own `@use` statements
- Entry files use `@forward` to aggregate partials
- Use relative paths in partials (e.g., `../../base/variables`)

## Adding New Styles

### For a New Component

1. Create the SCSS file in the appropriate domain folder:
   ```
   web-ui/src/scss/components/<domain>/NewComponent.scss
   ```

2. Start with section comments and use proper nesting:
   ```scss
   // ========================
   // New Component
   // ========================
   .new-component {
     // Use variables, not hardcoded values
     background: $color-surface;
     border-radius: $radius-lg;
     
     .header {
       @include panel-header;
     }
     
     .content {
       padding: 1rem;
     }
   }
   ```

3. Reference in Vue component:
   ```vue
   <style scoped lang="scss" src="@/scss/components/<domain>/NewComponent.scss"></style>
   ```

### For New Design Tokens

1. Add to `_variables.scss`:
   ```scss
   // Extended palette for feature X
   $color-feature-accent: #abc123;
   $color-feature-accent-hover: darken($color-feature-accent, 10%);
   ```

2. Document in this file under the appropriate section.

### For New Reusable Patterns

1. Add to `_mixins.scss`:
   ```scss
   @mixin new-pattern($param: default) {
     // Pattern implementation
   }
   ```

2. Document in this file under "Available Mixins".

3. Consider if it could replace existing duplicated code.
