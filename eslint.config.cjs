const js = require('@eslint/js');
const globals = require('globals');
const promise = require('eslint-plugin-promise');
const importPlugin = require('eslint-plugin-import');
const prettier = require('eslint-config-prettier');

module.exports = [
  // Ignore patterns (replaces .eslintignore)
  {
    ignores: [
      'node_modules/**',
      'logs/**',
      'src/logs/**',
      'postman/**',
      'prisma/migrations/**',
      'dist/**',
      '*.log',
    ],
  },
  // Base recommended rules
  js.configs.recommended,
  // Disable formatting rules that conflict with Prettier
  prettier,
  // Project-specific config
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
    plugins: {
      promise,
      import: importPlugin,
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'import/no-unresolved': 'off',
      semi: ['error', 'always'],
      quotes: 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
];
