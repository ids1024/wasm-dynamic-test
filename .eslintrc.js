module.exports = {
  env: {
    commonjs: true,
    es6: true,
    node: true
  },
  extends: "eslint:recommended",
  globals: {
    WebAssembly: 'readonly'
  },
  parserOptions: {
    ecmaVersion: 2018
  },
  rules: {
    "semi": ["error", "always"],
    "indent": ["error", 4]
  }
}
