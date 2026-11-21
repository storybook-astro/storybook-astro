import { expect, test } from '@playwright/test';
import { defineServerModeTests } from '@storybook-astro/integration-server-shared/server-mode-tests';

defineServerModeTests(test, expect);
