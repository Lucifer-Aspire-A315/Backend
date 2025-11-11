module.exports = {
  root: true,
  env: {
    es2021: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'script',
  },
  extends: [
    'eslint:recommended',
    'plugin:promise/recommended',
    'plugin:import/recommended',
    'prettier',
  ],
  plugins: ['promise', 'import'],
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-console': 'off',
    'import/no-unresolved': 'off', // Prisma and local aliasing in CJS can confuse this
    semi: ['error', 'always'],
    quotes: ['error', 'single'],
  },
  ignorePatterns: [
    'node_modules/',
    'logs/',
    'src/logs/',
    'postman/',
    'prisma/migrations/',
    'dist/',
    '*.log',
  ],
};
