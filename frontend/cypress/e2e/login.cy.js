describe('Login Flow', () => {
  beforeEach(() => {
    // Visit the login page
    cy.visit('/login')
    // Wait for page to load completely
    cy.wait(1000)
  })

  it('should login and navigate to dashboard', () => {
    // Fill in login form
    cy.get('input[name="email"]').type('testuser911@example.com')
    cy.get('input[name="password"]').type('password1231')

    // Submit login form
    cy.get('form').submit()

    // Wait 3 seconds to see the dashboard
    cy.wait(3000)
  })

  it('should validate login form fields', () => {
    // Test empty form submission
    cy.get('form').submit()
    cy.contains("can't be empty").should('be.visible')
    
    // Test invalid credentials
    cy.get('input[name="email"]').type('invalid@example.com')
    cy.get('input[name="password"]').type('wrongpassword')
    cy.get('form').submit()
    cy.contains('Invalid Email id.').should('be.visible')
  })
}) 