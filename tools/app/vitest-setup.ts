import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import '@/lib/i18n';

expect.extend(matchers);

afterEach(() => {
  cleanup();
});
