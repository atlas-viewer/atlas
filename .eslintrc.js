module.exports = {
  extends: ['@fesk/standard', 'plugin:import/typescript'],
  rules: {
    'react/prop-types': 0,
    'react/display-name': 0,
    'import/named': 0,
    'import/no-unresolved': 0,
    '@typescript-eslint/explicit-function-return-type': 0,
    '@typescript-eslint/no-explicit-any': 0,
    '@typescript-eslint/ban-ts-ignore': 1,
    '@typescript-eslint/no-var-requires': 0,
    '@typescript-eslint/no-unused-vars': 0,
    '@typescript-eslint/camelcase': 0,
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
};
