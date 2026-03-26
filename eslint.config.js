// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import eslintPluginJest from 'eslint-plugin-jest';
import eslintPluginNode from 'eslint-plugin-n';
import eslintPluginPromise from 'eslint-plugin-promise';
import eslintPluginWorkspaces from 'eslint-plugin-workspaces';
import svelte from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';
import js from '@eslint/js';
import ts from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';
import vue from 'eslint-plugin-vue';
// Svelte config lives in integration examples — use a minimal fallback for root ESLint
let svelteConfig;

try {
  svelteConfig = (await import('./integration/astro6/svelte.config.js')).default;
} catch {
  svelteConfig = {};
}

import astro from 'eslint-plugin-astro';

const ALL_EXTENSIONS = 'js,ts,jsx,tsx,cjs,mjs,mts,astro,svelte,vue';
const NODE_JS_FILES = [
  `./packages/@storybook-astro/framework/**/*.{${ALL_EXTENSIONS}}`,
  `./apps/*/.storybook/**/*.{${ALL_EXTENSIONS}}`,
  `./integration/*/.storybook/**/*.{${ALL_EXTENSIONS}}`,
  'eslint.config.mjs',
  'prettier.config.mjs'
];
const JSX_EXTENSIONS = 'js,ts,jsx,tsx,cjs,mjs,mts';
const JSX_FILES = [
  `./packages/@storybook-astro/renderer/**/*.{${JSX_EXTENSIONS}}`,
  `./apps/*/src/**/*.{${JSX_EXTENSIONS}}`,
  `./integration/*/src/**/*.{${JSX_EXTENSIONS}}`
];

/** @type {import('eslint').Linter.Config[]} */
export default [
  js.configs.recommended,
  ...ts.configs.recommended,
  eslintConfigPrettier,
  eslintPluginPromise.configs['flat/recommended'],
  ...astro.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
        // project: './tsconfig.json',
        extraFileExtensions: ['.vue']
      }
    }
  },
  // Node JS specific config
  {
    files: NODE_JS_FILES,

    ...eslintPluginNode.configs['flat/recommended-script'],

    rules: {
      ...eslintPluginNode.configs['flat/recommended-script'].rules,
      'n/no-unpublished-import': ['off'],
      // Missing imports are still tracked by TS
      'n/no-missing-import': ['off']
    }
  },
  // JSX specific config
  {
    files: JSX_FILES,
    languageOptions: {
      globals: {
        ...globals.browser
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      }
    }
  },
  // Svelte overrides
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parser: svelteParser,
      parserOptions: {
        svelteConfig,
        parser: ts.parser,
        extraFileExtensions: ['.svelte']
      }
    },
    plugins: {
      svelte,
      '@typescript-eslint': ts.plugin
    },
    rules: {
      ...ts.plugin.configs.recommended.rules,
      ...flattenConfigs(svelte.configs.recommended)
    }
  },
  // Astro overrides
  // {
  //   files: ["**/*.astro"],
  //   languageOptions: {
  //     parser: astroParser,
  //     parserOptions: {
  //       parser: ts.parser,
  //       extraFileExtensions: [".astro"],
  //     }
  //   },
  //   rules: {
  //     ...flattenConfigs()
  //   }
  // },

  // Disable Vue rules for .stories.jsx files
  {
    files: ['**/*.stories.jsx'],
    rules: {
      'vue/multi-word-component-names': 'off'
    }
  },
  // Disable svelte each-key requirement (not always needed for simple cases)
  {
    files: ['**/*.svelte'],
    rules: {
      'svelte/require-each-key': 'warn'
    }
  },
  // Allow any types in experimental code
  {
    files: ['**/portable-stories.ts', '**/middleware.ts', '**/testing.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-console': 'off'
    }
  },
  // Custom global overrides
  {
    files: [`**/*.{${ALL_EXTENSIONS}}`],

    plugins: {
      workspaces: eslintPluginWorkspaces
    },

    rules: {
      'newline-after-var': ['error', 'always'],
      'newline-before-return': ['error'],
      curly: ['warn', 'all'],
      camelcase: ['error'],
      'no-console': ['error', { allow: ['warn', 'error'] }],

      // Type import/exports
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        {
          prefer: 'type-imports',
          fixStyle: 'separate-type-imports'
        }
      ],

      // Use TS semi
      semi: ['error', 'always'],

      // Use TS no-unused-vars
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          ignoreRestSiblings: true,
          args: 'all',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          varsIgnorePattern: '^_'
        }
      ],

      // Use TS no-redeclare
      'no-redeclare': 'off',
      '@typescript-eslint/no-redeclare': 'error',

      // Disable unnecessary typescript rules
      '@typescript-eslint/triple-slash-reference': ['off'],

      // Type import/exports
      '@typescript-eslint/no-import-type-side-effects': ['error'],

      '@typescript-eslint/no-empty-object-type': [
        'error',
        {
          allowInterfaces: 'always'
        }
      ],

      'workspaces/no-relative-imports': 'error',
      'workspaces/no-absolute-imports': 'error',
      'workspaces/require-dependency': 'error'
    }
  },
  // Tests specific config
  {
    files: [`**/__tests__/**/*.{spec,test}.{${ALL_EXTENSIONS}}`],

    plugins: {
      jest: eslintPluginJest
    }
  },
  // Global ignores
  {
    ignores: [
      '.yarn/',
      '**/.astro',
      '**/coverage/',
      '**/@types/',
      '.vscode/',
      '.idea/',
      '**/storybook-static/',
      '**/dist/',
      '**/node_modules/'
    ]
  },
  ...storybook.configs["flat/recommended"]
];

/**
 * @param {Linter.RulesRecord[]} rules
 */
function flattenConfigs(configs) {
  return configs.reduce((acc, obj) => Object.assign(acc, obj.rules), {});
}
