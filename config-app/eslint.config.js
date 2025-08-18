import globals from 'globals';

export default [
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        // Vue globals from CDN
        Vue: "readonly"
      }
    },
    rules: {
      // Semicolon rules
      "semi": ["error", "always"],
      "semi-spacing": "error",
      "no-extra-semi": "error",
      
      // Code quality rules
      "no-unused-vars": "warn",
      "no-undef": "error",
      "prefer-const": "error",
      
      // Style consistency
      "quotes": ["error", "single"],
      "indent": ["error", 2]
    }
  }
];