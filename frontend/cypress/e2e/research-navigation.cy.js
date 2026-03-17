describe('Research Navigation and Dashboard Return', () => {
  beforeEach(() => {
    // Visit the login page
    cy.visit('/login')
    // Wait for page to load completely
    cy.wait(1000)
  })

  it('should login, click Start Your Research, wait 5 seconds, return to dashboard, then logout', () => {
    // Login first
    cy.get('input[name="email"]').type('testuser911@example.com')
    cy.get('input[name="password"]').type('password1231')
    cy.get('form').submit()

    // Verify we're on dashboard
    cy.url().should('include', '/dashboard')
    cy.contains('Welcome back').should('be.visible')
    cy.wait(2000)

    // Click Start Your Research button in navbar
    cy.contains('Start Your Research').click()
    cy.wait(5000) // Wait 5 seconds as requested

    // Click Dashboard button in navbar to return to dashboard
    cy.contains('Dashboard').click()
    cy.wait(2000)

    // Verify we're back on dashboard
    cy.url().should('include', '/dashboard')
    cy.contains('Welcome back').should('be.visible')
    cy.wait(2000)

    // Find and click the navbar dropdown for logout
    cy.get('nav, .navbar, .header').contains('▼').click()
    cy.wait(1000)

    // Click logout option
    cy.contains('Logout').click()
    cy.wait(2000)

    // Navigate to login page
    cy.visit('/login')
    cy.wait(3000)
  })
}) 