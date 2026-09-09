module.exports = {
    root: true,
    env: { browser: true, es2020: true },
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:react-hooks/recommended',
    ],
    ignorePatterns: ['dist', '.eslintrc.cjs', 'node_modules'],
    parser: '@typescript-eslint/parser',
    plugins: ['react-refresh'],
    rules: {
        indent: ['error', 4, { SwitchCase: 1 }],
        'react-refresh/only-export-components': [
            'warn',
            { allowConstantExport: true },
        ],
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        curly: ['error', 'all'],
        'brace-style': ['error', '1tbs', { allowSingleLine: false }],
        'padding-line-between-statements': [
            'error',
            { blankLine: 'always', prev: 'block-like', next: '*' },
        ],
    },
};
