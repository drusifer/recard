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
      // All 3 sites (identity.js, session.js, state.js) already try
      // crypto.randomUUID() first and only fall back to Math.random()
      // for an insecure context (this app's own README has guests join
      // over plain http/LAN) generating a join code / fallback id for a
      // same-room party card game - not an authentication or crypto
      // secret. No real security exposure to fix.
      'sonarjs/pseudo-random': 'off',
      // Session (session.js) groups its documented fields at the top,
      // then its two factory statics (host/join), then instance
      // methods - a deliberate, readable convention. This rule's
      // default order kept cascading to a new pairwise violation each
      // time one was fixed (static-before-constructor, then static-
      // before-fields), never converging - a sign its opinionated
      // default just doesn't fit this file, not a real smell.
      'unicorn/consistent-class-member-order': 'off',
      // Every instance is a completely standard, unambiguous pattern:
      // a `switch`'s own `break` (viewFor's per-pile-kind switch,
      // state.js) or a "found it, stop checking" loop `break`
      // (designLint.check.mjs), both nested inside an outer loop. JS
      // break semantics here are not ambiguous; extracting each into
      // its own function for this rule's sake would be a bigger,
      // riskier restructure than the "smell" it's flagging.
      'unicorn/no-break-in-nested-loop': 'off',
      // Several destructures exist ONLY to omit a field via the rest
      // sibling (`const { owner, faceUp, layout, ...plainCard } = card`)
      // - the named binding itself is never read, that's the point.
      // Real dead-code findings get fixed (US-66), not this pattern.
      'no-unused-vars': ['error', { ignoreRestSiblings: true }],
      // sonarjs's own no-unused-vars duplicates the core rule above but
      // has no ignoreRestSiblings option, so it still flags the
      // destructure-to-omit pattern the core rule now correctly allows.
      // The core rule alone covers this; no need for two.
      'sonarjs/no-unused-vars': 'off',
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
      // All 23 instances are the same Playwright idiom -
      // `(await locator.textContent()).trim()` / `(await x.evaluate(...))
      // === y` - inside already-dense one-line assertions. Splitting each
      // into a temp variable + separate statement adds verbosity with no
      // behavior or readability benefit here; same rationale as this
      // block's other test-only relaxations above.
      'unicorn/no-await-expression-member': 'off',
      // `getComputedStyle(...).maxWidth` etc. return CSS strings with a
      // unit suffix ("993.46px") - Number.parseFloat correctly extracts
      // the numeric prefix and ignores the rest; Number() would return
      // NaN on the trailing "px" instead. Real semantic difference, not
      // interchangeable here (same class of near-miss as the passed/
      // Object.hasOwn case in src/ui.js - caught before applying it).
      'unicorn/prefer-number-coercion': 'off',
    },
  },
  {
    files: ['src/components/**/*.js'],
    rules: {
      // Every one of these is `customElements.define(...)` at module
      // top level - the ONLY correct place to register a native Web
      // Component, not an incidental side effect. No alternative
      // pattern exists that isn't strictly worse.
      'unicorn/no-top-level-side-effects': 'off',
    },
  },
  {
    files: ['tests/designLint.check.mjs'],
    rules: {
      // This IS the CLI entry point the rule's own message asks for -
      // `npm run lint:design` invokes it directly expecting a clean
      // nonzero exit on failure. Throwing instead would print a raw
      // stack trace rather than the tool's own formatted violation
      // list, worse UX for exactly the audience (someone running the
      // lint) this script exists for.
      'unicorn/no-process-exit': 'off',
    },
  },
  {
    files: ['src/main.js'],
    rules: {
      // main.js is the app's entry-point controller module - there is
      // no framework/store/bundler here (deliberately, per D-history:
      // "no bundler/build step"). Its module-scoped `let` variables
      // (gameState, session, role, myId...) ARE the app's runtime
      // state, reassigned from event handlers by design - the exact
      // shape this rule assumes is always wrong. "Fixing" this properly
      // means wrapping all of it in a class/closure, a real
      // architecture change out of scope for a zero-behavior-change
      // lint sprint - flagged, not attempted mechanically.
      'unicorn/no-top-level-assignment-in-function': 'off',
    },
  },
];
