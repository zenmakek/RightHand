module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
    jest: true,
  },
  extends: ["eslint:recommended", "plugin:jest/recommended", "prettier"],
  parserOptions: {
    ecmaVersion: "latest",
  },
  rules: {
    "no-unused-vars": "error",
    eqeqeq: ["error", "always"],
    "no-console": "warn",
  },
  overrides: [
    {
      files: ["server.js"],
      rules: {
        "no-console": "off",
      },
    },
  ],
};
