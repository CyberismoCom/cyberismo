/// <reference types="cypress" />
// eslint-disable-next-line @typescript-eslint/no-require-imports
const t = require('../../src/locales/en/translation.json');
// These e2e tests use a 'cyberismo-bat' project that is created
// upon test run start based on the module-base repository content.
// Run these tests with ´npm run e2e:headless´

describe('Navigation', () => {
  Cypress.config('defaultCommandTimeout', 20000);

  before(() => {
    cy.task('createTestProject'); // Creates a new cyberismo-bat project based on module-base
    cy.task('writeGraph'); // Creates and edits graphModel, graphView and a report used for macros
  });

  //after(() => {
  //  cy.wait(1000);
  //  cy.task('deleteTestProject'); // Deletes cyberismo-bat project
  //});

  beforeEach(() => {
    cy.visit('');
  });

  it('delete page and verify empty project', () => {
    // Creates a new base module with name Basic Acceptance Test
    cy.get('h4').contains('Basic Acceptance Test'); // Verify project name
    cy.get('p').contains(t['selectCard']); // Verify text on cards page
    cy.get('p').contains('Untitled page').click(); // Navigate to Untitled page in tree menu
    cy.get('h1').contains('Untitled page'); // Verify Title in content area

    cy.get('[data-cy="contextMenuButton"]').click(); // Click dropdown menu with multiple options
    cy.get('[data-cy="deleteCardButton"]').click(); // Select Delete card option
    cy.get('[data-cy="confirmDeleteButton"]').click(); // confirm dialog
    cy.get('[role="presentation"]').contains(t['deleteCardSuccess']); // Verify text in popup infobox

    cy.get('p').contains(t['emptyProject']); // Verify text on cards page
  });

  it('Create cards macro', () => {
    cy.get('[data-cy="createNewButton"]').click(); // Click new card button in top right corner
    cy.get('[role="dialog"]').contains('New card from template'); // Verify title of the dialog
    cy.get('input').get('[placeholder="Search templates..."]'); // Verify dialog contains search templates field
    cy.get('.MuiButton-root').contains('Cancel'); // Verify dialog contains cancel button

    cy.get('.templateCard').contains('All data types').click(); // Select All data types template
    cy.get('.templateCard').contains('All data types'); // Select All data types template
    cy.get('.templateCard').get('.MuiRadio-action').get('[aria-checked="true"]'); // Verify  aria checked
    cy.get('[data-cy="confirmCreateButton"]').click(); // click create button
    cy.get('[role="presentation"]').contains(t.createCardModal['success']); // Verify text in popup infobox
    cy.get('.MuiSnackbar-endDecorator > .MuiIconButton-root').click(); // closes popup infobox
    cy.get('p').contains('Test all data types of custom fields'); // Verify title in tree menu
    cy.get('h1').contains('Test all data types of custom fields'); // Verify Title in content area
    //cy.get('[data-cy="linkIconButton"]').should('be.disabled');

    cy.get('h4').contains('Basic Acceptance Test').click();
    cy.get('[data-cy="createNewButton"]').click(); // Click new card button in top right corner
    cy.get('[role="dialog"]').contains('New card from template'); // Verify title of the dialog
    cy.get('.templateCard').contains('Policy checks and notifications').click(); // Select Policy checks and notifications template
    cy.get('.templateCard').get('.MuiRadio-action').get('[aria-checked="true"]');
    cy.get('[data-cy="confirmCreateButton"]').click();
    cy.get('[role="presentation"]').contains(t.createCardModal['success']); // Verify text in popup infobox
    cy.get('.MuiSnackbar-endDecorator > .MuiIconButton-root').click(); // closes popup infobox
    cy.get('p').contains('Test notifications and policy checks'); // Verify title in tree menu
    cy.get('h1').contains('Test notifications and policy checks'); // Verify Title in content area

    cy.get('h4').contains('Basic Acceptance Test').click();
    cy.get('[data-cy="createNewButton"]').click(); // Click new card button in top right corner
    cy.get('[role="dialog"]').contains('New card from template'); // Verify title of the dialog
    cy.get('.templateCard').contains('Test denied operations').click(); // Select Test denied operations template
    cy.get('.templateCard').get('.MuiRadio-action').get('[aria-checked="true"]');
    cy.get('[data-cy="confirmCreateButton"]').click();
    cy.get('[role="presentation"]').contains(t.createCardModal['success']); // Verify text in popup infobox
    cy.get('.MuiSnackbar-endDecorator > .MuiIconButton-root').click(); // closes popup infobox
    cy.get('p').contains('Test denied operations'); // Verify title in tree menu
    cy.get('h1').contains('Test denied operations'); // Verify Title in content area

    cy.get('h4').contains('Basic Acceptance Test').click();
    cy.get('[data-cy="createNewButton"]').click(); // Click new card button in top right corner
    cy.get('[role="dialog"]').contains('New card from template'); // Verify title of the dialog
    cy.get('.templateCard').contains('Page').click(); // Select Page template
    cy.get('.templateCard').get('.MuiRadio-action').get('[aria-checked="true"]');
    cy.get('[data-cy="confirmCreateButton"]').click();
    cy.get('[role="presentation"]').contains(t.createCardModal['success']); // Verify text in popup infobox
    cy.get('.MuiSnackbar-endDecorator > .MuiIconButton-root').click(); // closes popup infobox
    cy.get('p').contains('Untitled page'); // Verify title in tree menu
    cy.get('h1').contains('Untitled page'); // Verify Title in content area

    cy.get('h4').contains('Basic Acceptance Test').click();
    cy.get('[data-cy="createNewButton"]').click(); // Click new card button in top right corner
    cy.get('[role="dialog"]').contains('New card from template'); // Verify title of the dialog
    cy.get('.templateCard').contains('Page content').click(); // Select Page content template
    cy.get('.templateCard').get('.MuiRadio-action').get('[aria-checked="true"]');
    cy.get('[data-cy="confirmCreateButton"]').click();
    cy.get('[role="presentation"]').contains(t.createCardModal['success']); // Verify text in popup infobox
    cy.get('.MuiSnackbar-endDecorator > .MuiIconButton-root').click(); // closes popup infobox
    cy.get('p').contains('Untitled page'); // Verify title in tree menu
    cy.get('h1').contains('Untitled page'); // Verify Title in content area
  });

  it('Graph macro', () => {
    cy.get('p').contains('Untitled page content').click(); // Navigate to Untitled page content in tree menu
    cy.get('[data-cy="editButton"]').contains(t['edit']).click(); // Click edit button
    cy.get('.cm-activeLine').clear().type('{{}{{}#graph{moveToEnd} "model":"bat/graphModels/test1", "view":"bat/graphViews/test1"{{}{{}/graph{moveToEnd}'); // Type graph macro on the page
    cy.get('[data-cy="updateButton"]').click(); // Click update button
    cy.get('[role="presentation"]').contains(t.saveCard['success']); // Verify text in popup infobox
    cy.get('[class="doc"]').get('.cyberismo-svg-wrapper').get('[aria-label="fullscreen"]'); // Verify graph has fullscreen button
    cy.get('[class="doc"]').get('.cyberismo-svg-wrapper').get('[aria-label="download"]'); // Verify graph has download
    cy.get('[class="doc"]').get('.cyberismo-svg-wrapper').contains('Untitled page content'); // Verify graph text
  });

  it('Image macro', () => {
    cy.get('p').contains('Untitled page content').click(); // Navigate to Untitled page content in tree menu
    cy.get('h1').contains('Untitled page content'); // Verify Title in content area

    cy.get('[data-cy="contextMenuButton"]').click(); // Click dropdown menu with multiple options
    cy.get('[data-cy="addAttachmentButton"]').click(); // Select add attachment option
    // Verify add attachment dialog contents
    cy.get('[role="dialog"] > h2').contains(t['addAttachment']); // Add attachment text
    cy.get('[role="dialog"] > button'); // X button
    cy.get('[role="dialog"] >>> button').contains(t['cancel']); // Cancel button
    cy.get('[role="dialog"] >>> button').contains(t['add']); // Add button
    cy.get('[data-cy="fileUploadButton"]').selectFile('./cypress/fixtures/cyberismo.png',); // Add cyberismo.png to page
    cy.get('[role="dialog"] >>> button').contains(t['add']).click(); // Click add button
    cy.get('[role="presentation"]').contains(t.addAttachmentModal['success']); // Verify text in popup infobox
    cy.get('[data-cy="updateButton"]').click(); // Click update button

    let cardKey: string;
    cy.get('.MuiAccordionDetails-content > .MuiStack-root > .MuiTypography-body-sm').eq(0).then(($key) => {
      cy.log($key.text());
      cardKey = $key.text(); // Extract card key on the page
    });
    cy.get('p').contains('Untitled page').click(); // Navigate to Untitled page in tree menu
    cy.get('h1').contains('Untitled page'); // Verify Title in content area
    cy.get('[data-cy="editButton"]').contains(t['edit']).click(); // Click edit button
    cy.then(() => {
      cy.get('.cm-activeLine').clear().type('{{}{{}#image{moveToEnd}"fileName": "cyberismo.png","cardKey": "'+cardKey+'"{{}{{}/image{moveToEnd}'); // Type image macro on the page
    });
    cy.get('[data-cy="updateButton"]').click(); // Click update button
    cy.get('[role="presentation"]').contains(t.saveCard['success']); // Verify text in popup infobox
    cy.get('[class="doc"]').get('img').get('[alt="cyberismo"]'); // Check that image is present in asciidoc content
  });

  it('Include macro', () => {
    cy.get('p').contains('Untitled page content').click(); // Navigate to Untitled page content in tree menu
    cy.get('h1').contains('Untitled page content'); // Verify Title in content area

    let cardKey: string;
    cy.get('.MuiAccordionDetails-content > .MuiStack-root > .MuiTypography-body-sm').eq(0).then(($key) => {
      cy.log($key.text());
      cardKey = $key.text(); // Extract the text
    });

    cy.get('p').contains('Untitled page').click(); // Navigate to Untitled page in tree menu
    cy.get('h1').contains('Untitled page'); // Verify Title in content area
    cy.get('[data-cy="editButton"]').contains(t['edit']).click(); // Click edit button
    cy.then(() => {
      cy.get('.cm-activeLine').clear().type('{{}{{}#include{moveToEnd}"cardKey": "'+cardKey+'"{{}{{}/include{moveToEnd}'); // Type include macro on the page
    });
    cy.get('[data-cy="updateButton"]').click(); // Click update button
    cy.get('[role="presentation"]').contains(t.saveCard['success']); // Verify text in popup infobox
    cy.get('[class="doc"]').get('.cyberismo-svg-wrapper').get('[aria-label="fullscreen"]'); // Verify included graph has fullscreen button
    cy.get('[class="doc"]').get('.cyberismo-svg-wrapper').get('[aria-label="download"]'); // Verify included graph has download button
    cy.get('[class="doc"]').get('.cyberismo-svg-wrapper').contains('Untitled page content'); // Verify included graph has text
  });

  it('Percentage macro', () => {
    cy.get('p').contains('Test denied operations').click(); // Navigate to Test denied operations in tree menu
    cy.get('h1').contains('Test denied operations'); // Verify Title in content area
    cy.get('[data-cy="editButton"]').contains(t['edit']).click(); // Click edit button
    cy.get('.cm-activeLine').clear().type('{{}{{}#percentage{moveToEnd}"title": "Work done","value": 2,"legend": "of Assets","colour": "blue"{{}{{}/percentage{moveToEnd}'); // Type precentage macro on the page
    cy.get('[data-cy="updateButton"]').click(); // Click update button
    cy.get('[role="presentation"]').contains(t.saveCard['success']); // Verify text in popup infobox

    cy.get('[class="doc"]').get('svg').contains('Work done'); // Verify Percentage macro has text
    cy.get('[class="doc"]').get('svg').contains('2%'); // Verify Percentage macro has text
    cy.get('[class="doc"]').get('svg').contains('of Assets'); // Verify Percentage macro has text
    cy.get('[class="doc"]').get('svg').get('[stroke="blue"]'); // Verify Percentage macro color is blue
  });

  it('Report macro', () => {
    cy.get('p').contains('Test notifications and policy checks').click(); // Navigate to Test notifications and policy checks in tree menu
    cy.get('h1').contains('Test notifications and policy checks'); // Verify Title in content area
    cy.get('[data-cy="editButton"]').contains(t['edit']).click(); // Click edit button
    cy.get('.cm-activeLine').clear().type('{{}{{}#report{moveToEnd}"name": "bat/reports/test1"{{}{{}/report'); // Type report macro on the page
    cy.get('[data-cy="updateButton"]').click(); // Click update button
    cy.get('[role="presentation"]').contains(t.saveCard['success']); // Verify text in popup infobox
    cy.get('[class="doc"]').get('[class="paragraph"]').contains('* * * *'); // Verify report macro has text
  });

  it('Score card macro', () => {
    cy.get('p').contains('Test all data types of custom fields').click(); // Navigate to Test all data types of custom fields in tree menu
    cy.get('h1').contains('Test all data types of custom fields'); // Verify Title in content area
    cy.get('[data-cy="editButton"]').contains(t['edit']).click(); // Click edit button
    cy.get('.cm-activeLine').clear().type('{{}{{}#scoreCard{moveToEnd}"title": "Security control adoption","value": 30,"unit": "%","legend": "In progress"{{}{{}/scoreCard{moveToEnd}'); // Type score macro on the page
    cy.get('[data-cy="updateButton"]').click(); // Click update button
    cy.get('[role="presentation"]').contains(t.saveCard['success']); // Verify text in popup infobox
    cy.get('[class="doc"]').get('[class="card"]').contains('Security control adoption'); // Verify Score card macro has text
    cy.get('[class="doc"]').get('[class="card"]').contains('30').contains('%'); // Verify Score card macro has text
    cy.get('[class="doc"]').get('[class="card"]').contains('In progress'); // Verify Score card macro has text
  });

  it('Vega-Lite and Vega macros', () => {
    cy.get('p').contains('Untitled page').click(); // Navigate to Untitled page in tree menu
    cy.get('h1').contains('Untitled page'); // Verify Title in content area
    cy.get('[data-cy="editButton"]').contains(t['edit']).click(); // Click edit button
    cy.get('.cm-activeLine').clear().type('{{}{{}#vegaLite{moveToEnd}"spec":{{}"$schema": "https://vega.github.io/schema/vega-lite/v6.json","description": "A simple pie chart with embedded data.","data": {{}"values": [{{}"category": 1, "value": 4{rightArrow},{{}"category": 2, "value": 6{rightArrow},{{}"category": 3, "value": 10{rightArrow},{{}"category": 4, "value": 3{rightArrow},{{}"category": 5, "value": 7{rightArrow},{{}"category": 6, "value": 8{rightArrow}]{rightArrow},"mark": "arc","encoding": {{}"theta": {{}"field": "value", "type": "quantitative"{rightArrow},"color": {{}"field": "category", "type": "nominal"{rightArrow}{rightArrow}{rightArrow}{{}{{}/vegaLite{moveToEnd}'); // Edits card title // Type vega macro on the page
    cy.get('[data-cy="updateButton"]').click(); // Click update button
    cy.get('[role="presentation"]').contains(t.saveCard['success']); // Verify text in popup infobox
    cy.get('[class="doc"]').get('[class="vega-embed"]'); // Verify vega macro
  });

  it('Xref macro', () => {
    cy.get('p').contains('Untitled page').click(); // Navigate to Untitled page in tree menu
    cy.get('h1').contains('Untitled page'); // Verify Title in content area
    let cardKey: string;
    cy.get('.MuiAccordionDetails-content > .MuiStack-root > .MuiTypography-body-sm').eq(0).then(($key) => {
      cy.log($key.text());
      cardKey = $key.text();
    });
    cy.get('p').contains('Untitled page content').click(); // Navigate to Untitled page content in tree menu
    cy.get('h1').contains('Untitled page content'); // Verify Title in content area
    cy.get('[data-cy="editButton"]').contains(t['edit']).click(); // Click edit button
    cy.then(() => {
      cy.get('.cm-activeLine').clear().type('To give us feedback, see {{}{{}#xref{moveToEnd} "cardKey": "'+cardKey+'" {{}{{}/xref{moveToEnd}.'); // Type xref macro on the page
    });
    cy.get('[data-cy="updateButton"]').click(); // Click update button
    cy.get('[role="presentation"]').contains(t.saveCard['success']); // Verify text in popup infobox
    cy.get('[class="doc"]').contains('To give us feedback, see ');
    cy.then(() => {
      cy.get('[class="doc"]').get('[href="'+cardKey+'.html"]'); // Verify Xref macro
    });
  });
});
