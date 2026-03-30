describe('Signup Form Validation', () => {
  beforeEach(() => {
    // Visit the signup page
    cy.visit('/signup')
    // Wait for page to load completely
    cy.wait(1000)
  })

  it('should validate empty form submission', () => {
    // Test empty form submission
    cy.get('form').submit()
    cy.contains("can't be empty").should('be.visible')
  })

  it('should validate password mismatch', () => {
    // Fill in form with mismatched passwords
    cy.get('input[name="name"]').type('Test User')
    cy.get('input[name="username"]').type('testuser')
    cy.get('input[name="email"]').type('test@example.com')
    cy.get('input[name="password"]').type('password123')
    cy.get('input[name="confirmPassword"]').type('differentpassword')
    cy.get('form').submit()
    cy.contains('Passwords do not match').should('be.visible')
  })

  it('should validate email format', () => {
    // Fill in form with invalid email
    cy.get('input[name="name"]').type('Test User')
    cy.get('input[name="username"]').type('testuser')
    cy.get('input[name="email"]').type('invalid-email')
    cy.get('input[name="password"]').type('password123')
    cy.get('input[name="confirmPassword"]').type('password123')
    cy.get('form').submit()
    cy.contains('Invalid email address').should('be.visible')
  })

  it('should validate username requirements', () => {
    // Fill in form with short username
    cy.get('input[name="name"]').type('Test User')
    cy.get('input[name="username"]').type('ab')
    cy.get('input[name="email"]').type('test@example.com')
    cy.get('input[name="password"]').type('password123')
    cy.get('input[name="confirmPassword"]').type('password123')
    cy.get('form').submit()
    cy.contains('Username must be at least 3 characters').should('be.visible')
  })

  it('should validate password requirements', () => {
    // Fill in form with short password
    cy.get('input[name="name"]').type('Test User')
    cy.get('input[name="username"]').type('testuser')
    cy.get('input[name="email"]').type('test@example.com')
    cy.get('input[name="password"]').type('123')
    cy.get('input[name="confirmPassword"]').type('123')
    cy.get('form').submit()
    cy.contains('Password must be at least 6 characters').should('be.visible')
  })
}) 