module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'app.js',
    'controllers/**/*.js',
    'database/**/*.js',
    'models/**/*.js',
    'routes/**/*.js',
    'scanner/**/*.js',
    'services/**/*.js',
    'utils/**/*.js',
    '!server.js',
  ],
  coverageDirectory: 'coverage',
};
