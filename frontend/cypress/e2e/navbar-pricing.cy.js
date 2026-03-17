describe('Navbar Dropdown and Pricing Navigation', () => {
  beforeEach(() => {
    // Visit the login page
    cy.visit('/login')
    // Wait for page to load completely
    cy.wait(1000)
  })

  it('should expand navbar dropdown and navigate to pricing page', () => {
    // Login first
    cy.get('input[name="email"]').type('testuser911@example.com')
    cy.get('input[name="password"]').type('password1231')
    cy.get('form').submit()

    // Verify we're on dashboard
    cy.url().should('include', '/dashboard')
    cy.contains('Welcome back').should('be.visible')
    cy.wait(2000)

    // Find and click the navbar dropdown (look for common dropdown indicators)
    cy.get('nav, .navbar, .header').contains('▼').click()
    // Alternative selectors if the above doesn't work
    // cy.get('[data-testid="navbar-dropdown"], .dropdown-toggle, .nav-dropdown').click()
    cy.wait(1000)

    // Look for pricing option in the dropdown and click it
    cy.contains('Pricing').click()
    cy.wait(5000)

    // Verify we're on the pricing page
    cy.url().should('include', '/pricing')

    // Scroll to bottom of the pricing page
    cy.scrollTo('bottom')
    cy.wait(2000) // Wait to see the bottom content
    // Scroll to bottom of the pricing page
    
    cy.contains('Dashboard').click()
    cy.wait(1000)


  })
}) 