describe('Price Chart Time Filters', () => {
  beforeEach(() => {
    // Visit the login page
    cy.visit('/login')
    // Wait for page to load completely
    cy.wait(1000)
  })

  it('should test all price chart time filters', () => {
    // Login first
    cy.get('input[name="email"]').type('testuser911@example.com')
    cy.get('input[name="password"]').type('password1231')
    cy.get('form').submit()

    // Verify we're on dashboard
    cy.url().should('include', '/dashboard')
    cy.contains('Welcome back').should('be.visible')
    cy.wait(2000)

    // Wait for price chart to load
    cy.contains('Price Chart').should('be.visible')
    cy.wait(2000)

    // Open volume chart
    cy.contains('Show Volume Chart').click()
    cy.wait(2000)

    // Test 7 Days filter
    cy.contains('7 Days').click()
    cy.wait(5000) // Wait 5 seconds as requested

    // Test 14 Days filter
    cy.contains('14 Days').click()
    cy.wait(5000) // Wait 5 seconds as requested

    // Test 1 Month filter
    cy.contains('1 Month').click()
    cy.wait(5000) // Wait 5 seconds as requested

    // Test 6 Months filter
    cy.contains('6 Months').click()
    cy.wait(5000) // Wait 5 seconds as requested

    // Hover over volume bars when 6 months is selected
    cy.get('.recharts-bar-rectangle, .volume-bar, [data-testid="volume-bar"]').first().trigger('mouseover')
    cy.wait(2000)

    cy.get('.recharts-bar-rectangle, .volume-bar, [data-testid="volume-bar"]').eq(1).trigger('mouseover')
    cy.wait(2000)

    cy.get('.recharts-bar-rectangle, .volume-bar, [data-testid="volume-bar"]').eq(2).trigger('mouseover')
    cy.wait(2000)

    cy.get('.recharts-bar-rectangle, .volume-bar, [data-testid="volume-bar"]').eq(3).trigger('mouseover')
    cy.wait(2000)

    cy.get('.recharts-bar-rectangle, .volume-bar, [data-testid="volume-bar"]').eq(4).trigger('mouseover')
    cy.wait(2000)

    // Test 1 Year filter
    cy.contains('1 Year').click()
    cy.wait(5000) // Wait 5 seconds as requested

    // Verify chart is still visible after all filter changes
    cy.contains('Price Chart').should('be.visible')
  })
}) 