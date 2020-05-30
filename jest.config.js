module.exports = {
    preset: 'ts-jest/presets/js-with-babel',
    testEnvironment: 'node',
    cacheDirectory: '.jest-cache',
    coveragePathIgnorePatterns: [
        '/node_modules/',
        '/coverage/',
        '/examples/',
        'dist/',
        'lib/',
        '(.test)\\.(ts|tsx|js)$',
        'jest.transform.js',
        '.json',
    ],
    maxConcurrency: 4,
    modulePathIgnorePatterns: ['dist/', 'lib/'],
    globals: {
        window: {},
        self: {},
    },
};
