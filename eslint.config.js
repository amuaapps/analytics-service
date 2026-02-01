import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['dist', 'deployment', 'node_modules', 'coverage'],
  },
  {
    files: ['**/*.js'],
    extends: [eslint.configs.recommended],
  },
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      eslintConfigPrettier,
    ],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'no-console': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
    },
  },
  {
    files: ['tests/**/*.ts', 'tests/**/*.tsx'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/await-thenable': 'off',
    },
  },
  {
    files: [
      'src/infra/storage/in-memory-*.ts',
      'src/utils/cursor.ts',
      'src/infra/aws/s3-raw-event-store.ts',
      'src/infra/azure/blob-raw-event-store.ts',
      'src/app/azure/auth-middleware.ts',
      'src/app/azure/function-http-*.ts',
      'src/app/http/server.ts',
      'src/config/secrets.ts',
      'src/infra/aws/dynamodb-event-repository.ts',
      'src/infra/azure/cosmos-event-repository.ts',
    ],
    rules: {
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/await-thenable': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
    },
  }
);
