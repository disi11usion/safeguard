describe('Signup and Assessment Flow', () => {
  beforeEach(() => {
    // Visit the signup page
    cy.visit('/signup')
    // Wait for page to load completely
    cy.wait(1000)
  })

  it('should complete signup with assessment and reach dashboard', () => {
    // Fill in signup form
    cy.get('input[name="name"]').type('Test User111')
    cy.get('input[name="username"]').type('testuser111')
    cy.get('input[name="email"]').type('testuser911@example.com')
    cy.get('input[name="password"]').type('password1231')
    cy.get('input[name="confirmPassword"]').type('password1231')

    // Submit signup form
    cy.get('form').submit()

    // Wait for redirect to preferences/assessment page
    cy.url().should('include', '/preferences')
    cy.contains('Investment Profile Assessment').should('be.visible')
    // Wait for assessment page to fully load
    cy.wait(2000)

    // Answer all 10 questions with the last option for each
    // Question 1: Knowledge level
    cy.contains('I\'ve been investing for a long time, I\'m experienced').click()
    cy.contains('Next').click()
    cy.wait(1000)

    // Question 2: Investment motivation (multiple choice)
    cy.contains('To learn and have fun').click()
    cy.contains('Next').click()
    cy.wait(1000)

    // Question 3: Income portion
    cy.contains('More than 30%').click()
    cy.contains('Next').click()
    cy.wait(1000)

    // Question 4: Investment horizon
    cy.contains('7+ years').click()
    cy.contains('Next').click()
    cy.wait(1000)

    // Question 5: Risk perception
    cy.contains('There\'s always some risk where there\'s opportunity').click()
    cy.contains('Next').click()
    cy.wait(1000)

    // Question 6: Stress response
    cy.contains('I don\'t get stressed, I stay calm while investing').click()
    cy.contains('Next').click()
    cy.wait(1000)

    // Question 7: Decision method
    cy.contains('I haven\'t developed a method yet / haven\'t invested before').click()
    cy.contains('Next').click()
    cy.wait(1000)

    // Question 8: News reaction
    cy.contains('I wouldn\'t be affected by this kind of news').click()
    cy.contains('Next').click()
    cy.wait(1000)

    // Question 9: Market drop reaction
    cy.contains('I plan and execute with discipline').click()
    cy.contains('Next').click()
    cy.wait(1000)

    // Question 10: Coin selection (select BTC, ETH, XRP)
    cy.contains('Bitcoin (BTC)').click()
    cy.contains('Ethereum (ETH)').click()
    cy.contains('XRP (XRP)').click()

    // Complete assessment
    cy.contains('Complete Assessment').click()

    // Verify redirect to dashboard
    cy.url().should('include', '/dashboard')
    cy.contains('Welcome back').should('be.visible')
    cy.contains('Your Dashboard').should('be.visible')

    // Verify selected coins are displayed
    cy.contains('BTC, ETH, XRP').should('be.visible')
    
    // Wait 5 seconds after reaching dashboard before next test
    cy.wait(5000)
  })

}) 