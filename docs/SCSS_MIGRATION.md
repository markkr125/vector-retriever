# SCSS Migration Workplan

This project’s Web UI has been migrated from plain CSS files to SCSS, with a folder structure that keeps global tokens separate from component styles.

## Goals
- Use SCSS for organization and future reuse (partials/mixins), while keeping runtime theming via CSS variables.
- Keep styles external to Vue SFCs (no inline `<style>` blocks).
- Make it easy to find “global” vs “component” styling.

## Folder Structure
All Web UI styles live under `web-ui/src/scss/`:

- `web-ui/src/scss/main.scss`
  - Global SCSS entrypoint imported by `web-ui/src/main.js`.
- `web-ui/src/scss/base/`
  - `_globals.scss`: resets, `:root` CSS variables, global utility classes.
  - `_variables.scss`: optional Sass tokens (compile-time values only).
  - `_mixins.scss`: shared mixins.
- `web-ui/src/scss/components/`
  - `ComponentName.scss`: per-component styles.

## Component Convention
Each component keeps its style file in `web-ui/src/scss/components/` and references it from the Vue SFC:

```vue
<style scoped lang="scss" src="@/scss/components/ComponentName.scss"></style>
```

Why this pattern:
- Makes diffs smaller (logic vs style)
- Keeps styling discoverable
- Avoids large single-file components

## Migration Steps (repeatable checklist)
If you need to do this in another repo (or redo it cleanly), follow this order:

1. Add the Sass compiler
   - In `web-ui/package.json` add dev dependency `sass`.
   - Run `npm install` inside `web-ui/`.

2. Create SCSS structure
   - Add `web-ui/src/scss/base/`
   - Add `web-ui/src/scss/components/`
   - Add `web-ui/src/scss/main.scss`

3. Move global CSS → `base/_globals.scss`
   - Take content of the old global stylesheet (typically `src/style.css`) and move it into `web-ui/src/scss/base/_globals.scss`.
   - Keep `:root` CSS variables as-is to preserve runtime theming.

4. Point the app to the new entrypoint
   - Update `web-ui/src/main.js` to import `./scss/main.scss`.

5. Migrate component CSS files
   - For each `web-ui/src/css/*.css`, create the matching `web-ui/src/scss/components/*.scss`.
   - Start by copying the CSS content as-is; SCSS is a superset of CSS, so this is safe.

6. Update Vue components to reference SCSS
   - Replace `<style scoped src="@/css/Foo.css">` with:
     - `<style scoped lang="scss" src="@/scss/components/Foo.scss"></style>`

7. Remove old CSS sources of truth
   - Delete the old global CSS file and `web-ui/src/css/` once everything builds.

8. Validate
   - Run `npm run build` inside `web-ui/`.
   - Run `npm run test` inside `web-ui/`.

## Common Pitfalls
- Missing `sass` dependency: Vite won’t compile `.scss` without it.
- Leftover imports: search for `@/css/` and `style.css` in `web-ui/src`.
- Don’t convert runtime CSS variables into Sass variables unless you truly want compile-time-only theming.

## Optional Improvements (nice-to-have)
- Auto-inject shared mixins/variables using Vite `css.preprocessorOptions.scss.additionalData`.
  - This removes the need to manually `@use` shared partials in every component.
- Split `_globals.scss` further if it grows:
  - `_reset.scss`, `_tokens.scss`, `_utilities.scss`, `_animations.scss`.
