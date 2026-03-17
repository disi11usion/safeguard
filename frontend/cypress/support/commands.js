// ***********************************************
// This example commands.js shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************

// Custom command to wait for API calls to complete
Cypress.Commands.add('waitForApi', (alias) => {
  cy.wait(alias)
})

// Custom command to clear session storage
Cypress.Commands.add('clearSession', () => {
  cy.window().then((win) => {
    win.sessionStorage.clear()
  })
})

// Custom command to login (if needed for other tests)
Cypress.Commands.add('login', (email, password) => {
  cy.visit('/login')
  cy.get('input[name="email"]').type(email)
  cy.get('input[name="password"]').type(password)
  cy.get('form').submit()
  cy.url().should('include', '/dashboard')
}) 