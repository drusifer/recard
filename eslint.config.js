import js from '@eslint/js';
import unicorn from 'eslint-plugin-unicorn';
import sonarjs from 'eslint-plugin-sonarjs';

export default [
  {
    ignores: ['node_modules/**', 'build/**'],
  },
  js.configs.recommended,
  unicorn.configs['flat/recommended'],
  sonarjs.configs.recommended,
  {
    rules: {
      // Project convention: one class per file, filename matches the
      // class name in PascalCase (Pile.js, HandPile.js, Zone.js...) -
      // a standard, deliberate pattern, not smell. Fighting it for
      // kebab-case would rename ~15 files and every import site for
      // zero substantive benefit.
      'unicorn/filename-case': 'off',
      // Pile/Zone base classes (D56) are deliberately static-members-only
      // AS AN EXTENSIBLE INTERFACE - subclasses `extends Pile`/`extends
      // Zone` and override individual static members. The --fix for
      // this rule rewrites `class X {}` to `const X = {}`, which is
      // syntactically fine standalone but breaks every `extends X` -
      // confirmed live (all piles/zones subclassing it crashed at
      // import). Real architectural pattern, not smell.
      'unicorn/no-static-only-class': 'off',
      // `null` is a real, deliberate, JSON-serializable sentinel in this
      // codebase's wire/persistence layer (state.js piles/zones -
      // `ownerId: null` etc. - `persistence.js` JSON.stringify()s a raw
      // state snapshot). `undefined` is NOT interchangeable here:
      // `JSON.stringify({a: undefined})` silently drops the key,
      // `JSON.stringify({a: null})` keeps it - blanket-replacing null
      // with undefined risks silently corrupting the persisted/networked
      // shape this project has repeatedly called "byte-identical" and
      // load-bearing (D23, Phase 29). Dominant finding (189/435) -
      // flagged and resolved as one call, not fixed line-by-line.
      'unicorn/no-null': 'off',
    },
  },
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        localStorage: 'readonly',
        customElements: 'readonly',
        HTMLElement: 'readonly',
        CustomEvent: 'readonly',
        DragEvent: 'readonly',
        Event: 'readonly',
        MouseEvent: 'readonly',
        PointerEvent: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        structuredClone: 'readonly',
        crypto: 'readonly',
        performance: 'readonly',
        CSS: 'readonly',
        URLSearchParams: 'readonly',
      },
    },
  },
  {
    files: ['tools/**/*.mjs', 'tests/**/*.mjs', 'tests/**/*.js'],
    languageOptions: {
      globals: {
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        // Playwright's page.evaluate() callbacks run in a real browser,
        // even though this file itself executes under Node.
        DataTransfer: 'readonly',
        getComputedStyle: 'readonly',
      },
    },
  },
  {
    files: ['tests/**/*.js', 'tests/**/*.mjs'],
    rules: {
      // Test files legitimately use long, explicit assertion chains
      // and duplicated setup across cases - readability over DRY there.
      'sonarjs/no-duplicate-string': 'off',
      'sonarjs/cognitive-complexity': 'off',
      'unicorn/consistent-function-scoping': 'off',
      // Every instance here sorts a freshly-built array of plain
      // strings (object keys, card/zone ids) purely to make a
      // deepEqual/JSON.stringify assertion order-independent - default
      // lexicographic sort is already correct for strings, so an
      // explicit comparator would be pure noise, not a real fix.
      'unicorn/require-array-sort-compare': 'off',
    },
  },
];
