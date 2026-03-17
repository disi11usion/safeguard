const { defineConfig } = require('cypress')

module.exports = defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    setupNodeEvents(on, config) {
      // implement node event listeners here
    },
    viewportWidth: 2560,
    viewportHeight: 1440,
    video: false,
    screenshotOnRunFailure: true,
    scrollBehavior: 'top',
    defaultCommandTimeout: 10000,
    pageLoadTimeout: 30000,
  },
}) 