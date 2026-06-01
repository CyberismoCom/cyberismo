import { type APIRequestContext, type Page } from '@playwright/test';
import { test as base, expect } from './fixtures.js';

const createPageCard = async (page: Page) => {
  await page.getByTestId('createNewButton').click();
  await page
    .locator('.templateCard')
    .getByText('Page', { exact: true })
    .click();
  await page.getByTestId('confirmCreateButton').click();
  await expect(
    page
      .getByRole('presentation')
      .filter({ hasText: 'Card created successfully' }),
  ).toBeVisible();
  await page.getByTestId('notificationClose').first().click();
  await expect(
    page
      .getByRole('presentation')
      .filter({ hasText: 'Card created successfully' }),
  ).toHaveCount(0);
};

const patchCardContent = async (
  page: Page,
  request: APIRequestContext,
  content: string,
) => {
  const url = page.url();
  const cardKey = url.split('/cards/')[1];
  const projectPrefix = url.split('/projects/')[1].split('/')[0];
  const res = await request.patch(
    `/api/projects/${projectPrefix}/cards/${cardKey}`,
    {
      data: { content },
    },
  );
  if (!res.ok()) throw new Error(`PATCH failed: ${res.status()}`);
  await page.goto(`/projects/${projectPrefix}/cards/${cardKey}`);
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

base.describe('XSS Prevention', () => {
  base.beforeAll(async ({ resetProject }) => {
    await resetProject();
  });

  base.beforeEach(async ({ page }) => {
    page.on('dialog', (d) => {
      throw new Error(`XSS: dialog opened (${d.type()}: ${d.message()})`);
    });
    await page.goto('/');
  });

  base.describe('ScoreCard macro', () => {
    base('sanitizes script tag in title', async ({ page, request }) => {
      await createPageCard(page);
      await patchCardContent(
        page,
        request,
        scoreCardContent({ title: '<script>alert(1)</script>' }),
      );
      await expect(page.locator('.doc script')).toHaveCount(0);
      await expect(page.locator('.doc .card')).toHaveCount(1);
    });

    base('sanitizes img onerror in title', async ({ page, request }) => {
      await createPageCard(page);
      await patchCardContent(
        page,
        request,
        scoreCardContent({ title: '<img src=x onerror=alert(1)>' }),
      );
      await expect(page.locator('.doc [onerror]')).toHaveCount(0);
      await expect(page.locator('.doc .card')).toHaveCount(1);
    });

    base('sanitizes script tag in unit', async ({ page, request }) => {
      await createPageCard(page);
      await patchCardContent(
        page,
        request,
        scoreCardContent({ unit: '<script>alert(1)</script>' }),
      );
      await expect(page.locator('.doc script')).toHaveCount(0);
      await expect(page.locator('.doc').getByText('Safe title')).toBeVisible();
      await expect(page.locator('.doc').getByText('Safe legend')).toBeVisible();
    });

    base('sanitizes script tag in legend', async ({ page, request }) => {
      await createPageCard(page);
      await patchCardContent(
        page,
        request,
        scoreCardContent({ legend: '<script>alert(1)</script>' }),
      );
      await expect(page.locator('.doc script')).toHaveCount(0);
      await expect(page.locator('.doc').getByText('Safe title')).toBeVisible();
    });
  });

  base.describe('Percentage macro', () => {
    base('sanitizes script tag in title', async ({ page, request }) => {
      await createPageCard(page);
      await patchCardContent(
        page,
        request,
        percentageContent({ title: '<script>alert(1)</script>' }),
      );
      await expect(page.locator('.doc script')).toHaveCount(0);
      await expect(page.locator('.doc svg')).toHaveCount(1);
      await expect(page.locator('.doc').getByText('Safe legend')).toBeVisible();
    });

    base('sanitizes script tag in legend', async ({ page, request }) => {
      await createPageCard(page);
      await patchCardContent(
        page,
        request,
        percentageContent({ legend: '<script>alert(1)</script>' }),
      );
      await expect(page.locator('.doc script')).toHaveCount(0);
      await expect(page.locator('.doc svg')).toHaveCount(1);
      await expect(
        page
          .locator('.doc')
          .getByText('Safe title')
          .filter({ visible: true })
          .first(),
      ).toBeVisible();
    });
  });

  base.describe('Content-level XSS via AsciiDoc passthrough', () => {
    base(
      'sanitizes script tag in passthrough block',
      async ({ page, request }) => {
        await createPageCard(page);
        await patchCardContent(
          page,
          request,
          passthroughContent('<script>alert("xss")</script><p>Safe</p>'),
        );
        await expect(page.locator('.doc script')).toHaveCount(0);
        await expect(page.locator('.doc').getByText('Safe')).toBeVisible();
      },
    );

    base(
      'sanitizes event handler in passthrough block',
      async ({ page, request }) => {
        await createPageCard(page);
        await patchCardContent(
          page,
          request,
          passthroughContent('<div onmouseover="alert(1)">Hover</div>'),
        );
        await expect(page.locator('.doc [onmouseover]')).toHaveCount(0);
        await expect(page.locator('.doc').getByText('Hover')).toBeVisible();
      },
    );

    base(
      'sanitizes SVG onload in passthrough block',
      async ({ page, request }) => {
        await createPageCard(page);
        await patchCardContent(
          page,
          request,
          passthroughContent('<svg onload="alert(1)"><circle r="40"/></svg>'),
        );
        await expect(page.locator('.doc [onload]')).toHaveCount(0);
      },
    );

    base('sandboxes iframe in passthrough block', async ({ page, request }) => {
      await createPageCard(page);
      await patchCardContent(
        page,
        request,
        passthroughContent(
          '<iframe src="https://evil.example.com"></iframe><p>Safe</p>',
        ),
      );
      const iframe = page.locator('.doc iframe');
      await expect(iframe).toHaveCount(1);
      await expect(iframe).toHaveAttribute(
        'sandbox',
        'allow-scripts allow-same-origin',
      );
      await expect(page.locator('.doc').getByText('Safe')).toBeVisible();
    });

    base(
      'strips object tag in passthrough block',
      async ({ page, request }) => {
        await createPageCard(page);
        await patchCardContent(
          page,
          request,
          passthroughContent(
            '<object data="https://evil.example.com/mal.swf"></object><p>Safe</p>',
          ),
        );
        await expect(page.locator('.doc object')).toHaveCount(0);
        await expect(page.locator('.doc').getByText('Safe')).toBeVisible();
      },
    );

    base('strips embed tag in passthrough block', async ({ page, request }) => {
      await createPageCard(page);
      await patchCardContent(
        page,
        request,
        passthroughContent(
          '<embed src="https://evil.example.com/mal.swf"><p>Safe</p>',
        ),
      );
      await expect(page.locator('.doc embed')).toHaveCount(0);
      await expect(page.locator('.doc').getByText('Safe')).toBeVisible();
    });

    base(
      'strips form action in passthrough block',
      async ({ page, request }) => {
        await createPageCard(page);
        await patchCardContent(
          page,
          request,
          passthroughContent(
            '<form action="https://evil.example.com/steal"><input value="data"></form><p>Safe</p>',
          ),
        );
        await expect(page.locator('.doc form')).toHaveCount(0);
        await expect(page.locator('.doc').getByText('Safe')).toBeVisible();
      },
    );
  });

  base.describe('Allowed HTML elements via passthrough', () => {
    base('renders details/summary elements', async ({ page, request }) => {
      await createPageCard(page);
      await patchCardContent(
        page,
        request,
        passthroughContent(
          '<details><summary>Toggle title</summary><p>Hidden content</p></details>',
        ),
      );
      await expect(page.locator('.doc details')).toHaveCount(1);
      const summary = page.locator('.doc summary');
      await expect(summary).toHaveCount(1);
      await expect(summary).toContainText('Toggle title');
      await page.locator('.doc details summary').click();
      await expect(
        page.locator('.doc details').getByText('Hidden content'),
      ).toBeVisible();
    });

    base('renders video element', async ({ page, request }) => {
      await createPageCard(page);
      await patchCardContent(
        page,
        request,
        passthroughContent(
          '<video controls><source src="test.mp4" type="video/mp4"></video>',
        ),
      );
      const video = page.locator('.doc video');
      await expect(video).toHaveCount(1);
      await expect(video).toHaveAttribute('controls', '');
      const source = page.locator('.doc video source');
      await expect(source).toHaveCount(1);
      await expect(source).toHaveAttribute('src', 'test.mp4');
    });

    base(
      'renders iframe with forced sandbox attribute',
      async ({ page, request }) => {
        await createPageCard(page);
        await patchCardContent(
          page,
          request,
          passthroughContent(
            '<iframe src="https://www.youtube.com/embed/test" allowfullscreen></iframe>',
          ),
        );
        const iframe = page.locator('.doc iframe');
        await expect(iframe).toHaveCount(1);
        await expect(iframe).toHaveAttribute(
          'src',
          'https://www.youtube.com/embed/test',
        );
        await expect(iframe).toHaveAttribute(
          'sandbox',
          'allow-scripts allow-same-origin',
        );
      },
    );
  });
});
