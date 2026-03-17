describe('Navbar Dropdown and Logout', () => {
  beforeEach(() => {
    // Visit the login page
    cy.visit('/login')
    // Wait for page to load completely
    cy.wait(1000)
  })

  it('should login, go to dashboard, wait 5 seconds, then logout via navbar dropdown', () => {
    // Login first
    cy.get('input[name="email"]').type('testuser911@example.com')
    cy.get('input[name="password"]').type('password1231')
    cy.get('form').submit()

    // Verify we're on dashboard
    cy.url().should('include', '/dashboard')
    cy.contains('Welcome back').should('be.visible')
    cy.wait(5000) // Wait 5 seconds on dashboard as requested

    // Find and click the navbar dropdown (look for common dropdown indicators)
    cy.get('nav, .navbar, .header').contains('▼').click()
    // Alternative selectors if the above doesn't work
    // cy.get('[data-testid="navbar-dropdown"], .dropdown-toggle, .nav-dropdown').click()
    cy.wait(1000)

    // Look for logout option in the dropdown and click it
    cy.contains('Logout').click()

    // Navigate to login page
    cy.visit('/login')
    cy.wait(3000)
  })
}) 