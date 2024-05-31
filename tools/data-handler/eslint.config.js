// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
    {
        ignores: [
            "**/dist/*",
            "**/init.js"
        ]
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
]