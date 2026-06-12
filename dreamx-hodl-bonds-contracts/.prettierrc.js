module.exports = {
  plugins: ["prettier-plugin-solidity"],
  overrides: [
    {
      files: "*.sol",
      options: {
        bracketSpacing: false,
        printWidth: 120,
        tabWidth: 4,
        useTabs: false,
        singleQuote: false,
      },
    },
    {
      files: "*.js",
      options: {
        printWidth: 145,
        semi: true,
        trailingComma: "es5",
      },
    },
  ],
};
