/// <reference types="cypress" />
// eslint-disable-next-line @typescript-eslint/no-require-imports
const t = require('../../src/locales/en/translation.json');
const openMacroMenu = () =>
  cy.get('[role="tabpanel"] [aria-haspopup="menu"]').click();
const selectMacro = (name: string) =>
  cy.get('[role="menuitem"]').contains(name).click();
const editPage = () =>
  cy.get('[data-cy="editButton"]').contains(t['edit']).click();
const selectDropdownMenuOption = (option: string) =>
  cy.get('[role="listbox"] [role="option"]').contains(option).click();
const verifyNotificationMessage = (message: string) =>
  cy.get('[role="presentation"]').contains(t.saveCard[message]);
const percentageMacro =
  '{{}{{}#percentage{moveToEnd}"title": "Work done","value": 2,"legend": "of Assets","colour": "blue"{{}{{}/percentage{moveToEnd}';
const scoreCardMacro =
  '{{}{{}#scoreCard{moveToEnd}"title": "Security control adoption","value": 30,"unit": "%","legend": "In progress"{{}{{}/scoreCard{moveToEnd}';
const vegaLiteMacro =
  '{{}{{}#vegaLite{moveToEnd}"spec":{{}"$schema": "https://vega.github.io/schema/vega-lite/v6.json","description": "A simple pie chart with embedded data.","data": {{}"values": [{{}"category": 1, "value": 4{rightArrow},{{}"category": 2, "value": 6{rightArrow},{{}"category": 3, "value": 10{rightArrow},{{}"category": 4, "value": 3{rightArrow},{{}"category": 5, "value": 7{rightArrow},{{}"category": 6, "value": 8{rightArrow}]{rightArrow},"mark": "arc","encoding": {{}"theta": {{}"field": "value", "type": "quantitative"{rightArrow},"color": {{}"field": "category", "type": "nominal"{rightArrow}{rightArrow}{rightArrow}{{}{{}/vegaLite{moveToEnd}';

// These e2e tests use a 'cyberismo-bat' project that is created
// upon test run start based on the module-base repository content.
// Run these tests with ´npm run e2e:headless´

describe('Navigation', () => {
  Cypress.config('defaultCommandTimeout', 20000);

  before(() => {
    cy.task('createTestProject'); // Creates a new cyberismo-bat project based on module-base
  });

  after(() => {
    cy.wait(1000);
    cy.task('deleteTestProject'); // Deletes cyberismo-bat project
  });

  beforeEach(() => {
    cy.visit('');
  });

  it('Create cards macro', () => {
    cy.get('[data-cy="createNewButton"]').click(); // Click new card button in top right corner
    cy.get('.templateCard').contains('Page').click(); // Select page template
    cy.get('[data-cy="confirmCreateButton"]').click(); // confirm dialog
    cy.get('[role="presentation"]').contains(t.createCardModal['success']); // Verify text in popup infobox
    cy.get('h1').contains('Untitled page'); // Verify Title in content area
    // Edit page
    editPage(); // Click edit button
    cy.get('.MuiTextarea-textarea')
      .contains('Untitled page')
      .click()
      .clear()
      .type('Create cards page'); // Change page title
    cy.get('.cm-activeLine').clear(); // clear the page

    // add create All data types card button macro to page from toolbar
    openMacroMenu(); // Click macro helpers on toolbar
    selectMacro('Create cards'); // Click Create cards button
    cy.get('[role="dialog"]').contains('Cancel'); // Verify dialog contains cancel button
    cy.get('[role="dialog"]').contains('Create cards'); // Verify dialog contains Create cards text
    cy.get('[role="dialog"]').contains('Template').click(); // Click Template button
    cy.get('[role="listbox"] [role="option"]')
      .contains('All data types')
      .click(); // select All data types from dropdown menu
    cy.get('[placeholder="Enter button text"]')
      .click()
      .clear()
      .type('Test Create All data types page'); // Type button text
    cy.get('[role="dialog"]').contains('Insert macro').click(); // Click Insert macro button

    // add create Policy checks and notifications card button macro to page from toolbar
    openMacroMenu(); // Click macro helpers on toolbar
    selectMacro('Create cards'); // Click Create cards button
    cy.get('[role="dialog"]').contains('Template').click(); // Click Template button
    cy.get('[role="listbox"] [role="option"]')
      .contains('Policy checks and notifications')
      .click(); // select Policy checks and notifications from dropdown menu
    cy.get('[placeholder="Enter button text"]')
      .click()
      .clear()
      .type('Create Policy checks and notifications page'); // Type button text
    cy.get('[role="dialog"]').contains('Insert macro').click(); // Click Insert macro button

    // add create Test denied operations card button macro to page from toolbar
    openMacroMenu(); // Click macro helpers on toolbar
    selectMacro('Create cards'); // Click Create cards button
    cy.get('[role="dialog"]').contains('Template').click(); // Click Template button
    cy.get('[role="listbox"] [role="option"]')
      .contains('Test denied operations')
      .click(); // select  from dropdown menu
    cy.get('[placeholder="Enter button text"]')
      .click()
      .clear()
      .type('Create Test denied operations page'); // Type button text
    cy.get('[role="dialog"]').contains('Insert macro').click(); // Click Insert macro button

    // add create empty page card button macro to page from toolbar
    openMacroMenu(); // Click macro helpers on toolbar
    selectMacro('Create cards'); // Click Create cards button
    cy.get('[role="dialog"]').contains('Template').click(); // Click Template button
    selectDropdownMenuOption('Page'); // select Page from dropdown menu
    cy.get('[placeholder="Enter button text"]')
      .click()
      .clear()
      .type('Create empty page'); // Type button text
    cy.get('[role="dialog"]').contains('Insert macro').click(); // Click Insert macro button

    // add create page content card button macro to page from toolbar
    openMacroMenu(); // Click macro helpers on toolbar
    selectMacro('Create cards'); // Click Create cards button
    cy.get('[role="dialog"]').contains('Template').click(); // Click Template button
    selectDropdownMenuOption('Page content'); // select Page content from dropdown menu
    cy.get('[placeholder="Enter button text"]')
      .click()
      .clear()
      .type('Create page content'); // Type button text
    cy.get('[role="dialog"]').contains('Insert macro').click(); // Click Insert macro button

    // update page
    cy.get('[data-cy="updateButton"]').click(); // Click update button
    cy.get('[role="presentation"]').contains('Card saved successfully'); // Verify text in popup infobox
    cy.get('[data-cy="notificationClose"]').click(); // closes popup infobox
    cy.get('[role="presentation"]')
      .contains('Card saved successfully')
      .should('not.exist'); // Verify popup infobox closes
    // verify macro
    cy.get('[class="doc"]')
      .get('[type="button"]')
      .contains('Test Create All data types page')
      .click(); // Create test card with the button
    cy.get('[role="presentation"]').contains('Card created successfully'); // Verify text in popup infobox
    cy.get('[data-cy="notificationClose"]').click(); // closes popup infobox
    cy.get('[role="presentation"]')
      .contains('Card created successfully')
      .should('not.exist'); // Verify popup infobox closes
    cy.get('h1').contains('Test all data types of custom fields'); // Verify Title in content area
  });

  it('Graph macro', () => {
    cy.get('[role="tree"]').contains('Create cards page').click(); // Navigate to Create cards page in tree menu
    cy.get('[class="doc"]')
      .get('[type="button"]')
      .contains('Create Policy checks and notifications page')
      .click(); // Create card for graph macro with create card button
    cy.get('[role="presentation"]').contains('Card created successfully'); // Verify text in popup infobox
    cy.get('[data-cy="notificationClose"]').click(); // closes popup infobox
    cy.get('[role="presentation"]')
      .contains('Card created successfully')
      .should('not.exist'); // Verify popup infobox closes
    cy.get('h1').contains('Test notifications and policy checks'); // Verify Title in content area

    editPage(); // Click edit button
    cy.get('.cm-activeLine').clear(); // clear the page
    // add Graph macro with Macro helpers for toolbars
    openMacroMenu(); // Click macro helpers on toolbar
    selectMacro('Graph'); // Click Graph button
    cy.get('[role="dialog"]').contains('Cancel'); // Verify dialog contains cancel button
    cy.get('[role="dialog"]').contains('Graph'); // Verify dialog contains Graph text
    cy.get('[role="dialog"]').contains('Graph model').click(); // Click Graph model to open dropdown
    cy.get('[role="listbox"] [role="option"]')
      .contains('bat/graphModels/test1')
      .click(); // select test1 graphModel from dropdown menu
    cy.get('[role="dialog"]').contains('Graph view').click(); // Click Graph view to open dropdown
    cy.get('[role="listbox"] [role="option"]')
      .contains('bat/graphViews/test1')
      .click(); // select test1 graphView from dropdown menu
    cy.get('[role="dialog"]').contains('Insert macro').click(); // Click Insert macro button
    // verify macro
    cy.get('[data-cy="updateButton"]').click(); // Click update button
    verifyNotificationMessage('success'); // Verify text in popup infobox
    cy.get('[data-cy="notificationClose"]').click(); // closes popup infobox
    cy.get('[role="presentation"]').contains('success').should('not.exist'); // Verify popup infobox closes
    cy.get('[class="doc"]')
      .get('.cyberismo-svg-wrapper')
      .get('[aria-label="fullscreen"]'); // Verify graph has fullscreen button
    cy.get('[class="doc"]')
      .get('.cyberismo-svg-wrapper')
      .get('[aria-label="download"]'); // Verify graph has download
    cy.get('[class="doc"]')
      .get('.cyberismo-svg-wrapper')
      .contains('Test notifications and policy checks'); // Verify graph text
  });

  it('Image macro', () => {
    cy.get('[role="tree"]').contains('Create cards page').click(); // Navigate to Create cards page in tree menu
    cy.get('h1').contains('Create cards page'); // Verify Title in content area

    cy.get('[data-cy="contextMenuButton"]').click(); // Click dropdown menu with multiple options
    cy.get('[data-cy="addAttachmentButton"]').click(); // Select add attachment option
    // Verify add attachment dialog contents
    cy.get('[role="dialog"] > h2').contains(t['addAttachment']); // Add attachment text
    cy.get('[role="dialog"] > button'); // X button
    cy.get('[role="dialog"] >>> button').contains(t['cancel']); // Cancel button
    cy.get('[role="dialog"] >>> button').contains(t['add']); // Add button
    cy.get('[data-cy="fileUploadButton"]').selectFile(
      './cypress/fixtures/cyberismo.png',
    ); // Add cyberismo.png to page
    cy.get('[role="dialog"] >>> button').contains(t['add']).click(); // Click add button
    cy.get('[role="presentation"]').contains(
      'Attachment(s) added successfully',
    ); // Verify text in popup infobox
    // Check that attachment side panel element exists and "hover" over it to show action buttons
    cy.get('span').contains('cyberismo.png').trigger('mouseover');
    cy.get('[data-cy="insertToContentButton"]').click();
    cy.get('[data-cy="updateButton"]').click(); // Click update button

    let cardKey: string; // string for card key of the page
    cy.get('[data-cy="metadataView"] .MuiTypography-body-sm')
      .eq(0)
      .then(($key) => {
        cardKey = $key.text();
      }); // Extract card key on the page
    cy.get('[class="doc"]')
      .get('[type="button"]')
      .contains('Create Test denied operations page')
      .click(); // Create card for image macro with create card button
    cy.get('[role="presentation"]').contains('Card created successfully'); // Verify text in popup infobox
    cy.get('h1').contains('Test denied operations'); // Verify Title in content area
    editPage(); // Click edit button
    cy.then(() => {
      cy.get('.cm-activeLine')
        .clear()
        .type(
          '{{}{{}#image{moveToEnd}"fileName": "cyberismo.png","cardKey": "' +
            cardKey +
            '"{{}{{}/image{moveToEnd}',
        );
    }); // Type image macro on the page
    cy.get('[data-cy="updateButton"]').click(); // Click update button
    cy.get('[role="presentation"]').contains('Card saved successfully'); // Verify text in popup infobox
    cy.get('.doc').get('img').get('[alt="cyberismo"]'); // Check that image is present in asciidoc content
  });

  it('Include macro', () => {
    cy.get('[role="tree"]').contains('Create cards page').click(); // Navigate to Create cards page in tree menu
    cy.get('h1').contains('Create cards page'); // Verify Title in content area

    let cardKey: string;
    cy.get('[data-cy="metadataView"] .MuiTypography-body-sm')
      .eq(0)
      .then(($key) => {
        cardKey = $key.text();
      }); // Extract card key on the page

    cy.get('[class="doc"]')
      .get('[type="button"]')
      .contains('Create empty page')
      .click(); // Create card for include macro with create card button
    cy.get('[role="presentation"]').contains('Card created successfully'); // Verify text in popup infobox
    cy.get('h1').contains('Untitled page'); // Verify Title in content area
    // included card macro
    editPage(); // Click edit button
    openMacroMenu(); // Click macro helpers on toolbar
    selectMacro('Include a card'); // Click Include a card button
    cy.get('[role="dialog"]').contains('Cancel'); // Verify dialog contains cancel button
    cy.get('[role="dialog"]').contains('Include a card');
    cy.get('[role="dialog"]').get('label').contains('Card');
    cy.get('[role="dialog"]').get('label').contains('Level offset');
    cy.get('[role="dialog"]').get('label').contains('Include title');
    cy.get('[role="dialog"]').get('label').contains('Page titles');
    cy.get('[placeholder="Select a card"]').click();
    cy.then(() => {
      cy.get('[role="listbox"] [role="option"]')
        .contains('Create cards page (' + cardKey + ')')
        .click();
    });
    cy.get('[role="dialog"]').get('label svg').trigger('mouseover');
    cy.get('[role="tooltip"]').contains(
      'An optional offset to adjust the heading levels of the included content. For example ',
    );
    cy.get('[placeholder="+1"]').click().clear().type('1'); // Type Image macro on the page
    cy.get('[role="dialog"]').get('label').contains('Include title').click();
    selectDropdownMenuOption('Include'); // select Include from dropdown menu
    cy.get('[role="dialog"]').get('label').contains('Page titles').click();
    selectDropdownMenuOption('Normal'); // select Normal from dropdown menu
    cy.get('[role="dialog"]').contains('Insert macro').click(); // Click Insert macro button
    // verify included card content
    cy.get('[data-cy="updateButton"]').click(); // Click update button
    verifyNotificationMessage('success'); // Verify text in popup infobox
    cy.get('h2').contains('Create cards page'); // Verify included card title in content area
    cy.get('[class="doc"]')
      .get('[type="button"]')
      .contains('Create empty page');
    cy.get('[class="doc"]')
      .get('[type="button"]')
      .contains('Create Test denied operations page');
    cy.get('[class="doc"]')
      .get('[type="button"]')
      .contains('Create Policy checks and notifications page');
    cy.get('[class="doc"]')
      .get('[type="button"]')
      .contains('Test Create All data types page');
    cy.get('[class="doc"]')
      .get('[type="button"]')
      .contains('Create page content');

    // included card macro
    editPage(); // Click edit button
    cy.get('.cm-activeLine').clear(); // clear the page
    openMacroMenu(); // Click macro helpers on toolbar
    selectMacro('Include a card'); // Click Include a card button
    cy.get('[placeholder="Select a card"]').click();
    cy.then(() => {
      cy.get('[role="listbox"] [role="option"]')
        .contains('Create cards page (' + cardKey + ')')
        .click();
    });
    cy.get('[placeholder="+1"]').click().clear().type('2'); // Type Image macro on the page
    cy.get('[role="dialog"]').get('label').contains('Include title').click();
    selectDropdownMenuOption('Only'); // select Only from dropdown menu
    cy.get('[role="dialog"]').get('label').contains('Page titles').click();
    selectDropdownMenuOption('Discrete'); // select Discrete from dropdown menu
    cy.get('[role="dialog"]').contains('Insert macro').click(); // Click Insert macro button
    // verify included card content
    cy.get('[data-cy="updateButton"]').click(); // Click update button
    verifyNotificationMessage('success'); // Verify text in popup infobox
    cy.get('h3').get('[class="discrete"]').contains('Create cards page'); // Verify Title in content area
    cy.get('[class="doc"]')
      .get('[type="button"]')
      .contains('Create empty page')
      .should('not.exist'); // Verify page does not contain create buttons

    // included card macro
    editPage(); // Click edit button
    cy.get('.cm-activeLine').clear(); // clear the page
    openMacroMenu(); // Click macro helpers on toolbar
    selectMacro('Include a card'); // Click Include a card button
    cy.get('[placeholder="Select a card"]').click();
    cy.then(() => {
      cy.get('[role="listbox"] [role="option"]')
        .contains('Create cards page (' + cardKey + ')')
        .click();
    });
    cy.get('[placeholder="+1"]').click().clear().type('2'); // Type Image macro on the page
    cy.get('[role="dialog"]').get('label').contains('Include title').click();
    selectDropdownMenuOption('Exclude'); // select Exclude from dropdown menu
    cy.get('[role="dialog"]').contains('Insert macro').click(); // Click Insert macro button
    // verify included card content
    cy.get('[data-cy="updateButton"]').click(); // Click update button
    verifyNotificationMessage('success'); // Verify text in popup infobox
    cy.get('h3').should('not.exist'); // Verify no title in content area
    cy.get('[class="doc"]')
      .get('[type="button"]')
      .contains('Create empty page');
  });

  it('Percentage macro', () => {
    cy.get('[role="tree"]').contains('Create cards page').click(); // Navigate to Create cards page in tree menu
    cy.get('h1').contains('Create cards page'); // Verify Title in content area
    cy.get('[class="doc"]')
      .get('[type="button"]')
      .contains('Create page content')
      .click(); // Create card for precentage macro with create card button
    cy.get('[role="presentation"]').contains('Card created successfully'); // Verify text in popup infobox
    cy.get('[data-cy="notificationClose"]').click(); // closes popup infobox
    cy.get('[role="presentation"]')
      .contains('Card created successfully')
      .should('not.exist'); // Verify popup infobox closes
    cy.get('h1').contains('Untitled page content'); // Verify Title in content area

    editPage(); // Click edit button
    cy.get('.cm-activeLine').clear().type(percentageMacro); // Type precentage macro on the page
    cy.get('[data-cy="updateButton"]').click(); // Click update button
    verifyNotificationMessage('success'); // Verify text in popup infobox

    cy.get('[class="doc"]').get('svg').contains('Work done'); // Verify Percentage macro has text
    cy.get('[class="doc"]').get('svg').contains('2%'); // Verify Percentage macro has text
    cy.get('[class="doc"]').get('svg').contains('of Assets'); // Verify Percentage macro has text
    cy.get('[class="doc"]').get('svg').get('[stroke="blue"]'); // Verify Percentage macro color is blue
  });

  it('Report macro', () => {
    cy.get('[role="tree"]').contains('Create cards page').click(); // Navigate to Create cards page in tree menu
    cy.get('h1').contains('Create cards page'); // Verify Title in content area
    cy.get('[class="doc"]')
      .get('[type="button"]')
      .contains('Create empty page')
      .click(); // Create card for report macro with create card button
    cy.get('[role="presentation"]').contains('Card created successfully'); // Verify text in popup infobox
    cy.get('[data-cy="notificationClose"]').click(); // closes popup infobox
    cy.get('[role="presentation"]')
      .contains('Card created successfully')
      .should('not.exist'); // Verify popup infobox closes
    cy.get('h1').contains('Untitled page'); // Verify Title in content area

    editPage(); // Click edit button
    openMacroMenu(); // Click macro helpers on toolbar
    selectMacro('Report'); // Click Report button
    cy.get('[role="dialog"]').contains('Cancel'); // Verify dialog contains cancel button
    cy.get('[role="dialog"]').get('label').contains('Report').click();
    cy.get('[role="listbox"] [role="option"]')
      .contains('bat/reports/test1')
      .click();
    cy.get('[role="dialog"]').contains('Insert macro').click(); // Click Insert macro button
    cy.get('[data-cy="updateButton"]').click(); // Click update button
    verifyNotificationMessage('success'); // Verify text in popup infobox
    cy.get('[class="doc"]').get('[class="paragraph"]').contains('* * * *'); // Verify report macro has text
  });

  it('Score card macro', () => {
    cy.get('[role="tree"]').contains('Create cards page').click(); // Navigate to Create cards page in tree menu
    cy.get('h1').contains('Create cards page'); // Verify Title in content area
    cy.get('[class="doc"]')
      .get('[type="button"]')
      .contains('Create empty page')
      .click();
    cy.get('[role="presentation"]').contains('Card created successfully'); // Verify text in popup infobox
    cy.get('[data-cy="notificationClose"]').click(); // closes popup infobox
    cy.get('[role="presentation"]')
      .contains('Card created successfully')
      .should('not.exist'); // Verify popup infobox closes
    cy.get('h1').contains('Untitled page'); // Verify Title in content area

    editPage(); // Click edit button
    cy.get('.cm-activeLine').clear().type(scoreCardMacro); // Type score macro on the page
    cy.get('[data-cy="updateButton"]').click(); // Click update button
    verifyNotificationMessage('success'); // Verify text in popup infobox
    cy.get('[class="doc"]')
      .get('[class="card"]')
      .contains('Security control adoption'); // Verify Score card macro has text
    cy.get('[class="doc"]').get('[class="card"]').contains('30').contains('%'); // Verify Score card macro has text
    cy.get('[class="doc"]').get('[class="card"]').contains('In progress'); // Verify Score card macro has text
  });

  it('Vega-Lite and Vega macros', () => {
    cy.get('[role="tree"]').contains('Create cards page').click(); // Navigate to Create cards page in tree menu
    cy.get('h1').contains('Create cards page'); // Verify Title in content area
    cy.get('[class="doc"]')
      .get('[type="button"]')
      .contains('Create empty page')
      .click(); // Create card for vega macro with create card button
    cy.get('[role="presentation"]').contains('Card created successfully'); // Verify text in popup infobox
    cy.get('[data-cy="notificationClose"]').click(); // closes popup infobox
    cy.get('[role="presentation"]')
      .contains('Card created successfully')
      .should('not.exist'); // Verify popup infobox closes
    cy.get('h1').contains('Untitled page'); // Verify Title in content area

    editPage(); // Click edit button
    cy.get('.cm-activeLine').clear().type(vegaLiteMacro); // Type vega macro on the page
    cy.get('[data-cy="updateButton"]').click(); // Click update button
    verifyNotificationMessage('success'); // Verify text in popup infobox
    cy.get('[class="doc"]').get('[class="vega-embed"]'); // Verify vega macro
  });

  it('Xref macro', () => {
    cy.get('[role="tree"]').contains('Create cards page').click(); // Navigate to Create cards page in tree menu
    cy.get('h1').contains('Create cards page'); // Verify Title in content area

    let cardKey: string;
    cy.get('[data-cy="metadataView"] .MuiTypography-body-sm')
      .eq(0)
      .then(($key) => {
        cardKey = $key.text();
      }); // Extract card key on the page
    cy.get('[class="doc"]')
      .get('[type="button"]')
      .contains('Create empty page')
      .click(); // Create card for xref macro with create card button
    cy.get('[role="presentation"]').contains('Card created successfully'); // Verify text in popup infobox
    cy.get('[data-cy="notificationClose"]').click(); // closes popup infobox
    cy.get('[role="presentation"]')
      .contains('Card created successfully')
      .should('not.exist'); // Verify popup infobox closes
    cy.get('h1').contains('Untitled page'); // Verify Title in content area

    editPage(); // Click edit button
    openMacroMenu(); // Click macro helpers on toolbar
    selectMacro('Cross reference'); // Click Cross reference button
    cy.get('[role="dialog"]').contains('Cancel'); // Verify dialog contains cancel button
    cy.get('[role="dialog"]').get('label').contains('Card');
    cy.get('[placeholder="Select a card"]').click(); // Type graph macro on the page

    cy.then(() => {
      cy.get('[role="listbox"] [role="option"]')
        .contains('Create cards page (' + cardKey + ')')
        .click();
    });
    cy.get('[role="dialog"]').contains('Insert macro').click(); // Click Insert macro button

    cy.get('[data-cy="updateButton"]').click(); // Click update button
    verifyNotificationMessage('success'); // Verify text in popup infobox
    cy.then(() => {
      cy.get('[class="doc"]')
        .get('[href="' + cardKey + '.html"]')
        .contains('Create cards page'); // Verify Xref macro
    });
  });
});
