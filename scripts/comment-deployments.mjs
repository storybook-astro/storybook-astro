/* eslint n/no-unsupported-features/node-builtins: ["error", {"ignores": ["fetch"]}] */
// Keeps one comment on a pull request with a grid of every Storybook deployed
// for its head commit: the static (prerendered) builds Chromatic publishes,
// and the server-mode apps on Vercel, Cloudflare Workers and Netlify.
//
// Run by .github/workflows/deploy-server-apps.yml after its deploy jobs.
// Cloudflare and Netlify URLs come from those jobs (one JSON file each in
// DEPLOYMENTS_DIR); Vercel and Chromatic report theirs to GitHub, so this
// waits for them there.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const { GITHUB_TOKEN, GITHUB_REPOSITORY, PR_NUMBER, HEAD_SHA, DEPLOYMENTS_DIR, RUN_URL } = process.env;
const MARKER = '<!-- storybook-astro-deployments -->';
const ASTRO_VERSIONS = [5, 6, 7];
const WAIT_MINUTES = 15;

const fromJobs = await readJobDeployments();
const fromGitHub = await waitForGitHubDeployments();

await upsertComment(renderComment({ ...fromGitHub, ...fromJobs }));

/** `astro6-server-cloudflare` style keys, from the deploy jobs' JSON files. */
async function readJobDeployments() {
  const deployments = {};
  const files = await readdir(DEPLOYMENTS_DIR, { recursive: true }).catch(() => []);

  for (const file of files.filter((name) => name.endsWith('.json'))) {
    const { app, url } = JSON.parse(await readFile(join(DEPLOYMENTS_DIR, file), 'utf8'));

    deployments[app] = url;
  }

  return deployments;
}

/** Polls GitHub until Vercel and Chromatic have reported every build, or gives up. */
async function waitForGitHubDeployments() {
  const deadline = Date.now() + WAIT_MINUTES * 60_000;
  let found = {};

  while (Date.now() < deadline) {
    found = { ...(await vercelDeployments()), ...(await chromaticStorybooks()) };

    const missing = ASTRO_VERSIONS.flatMap((astro) => [`astro${astro}-static`, `astro${astro}-server-vercel`]).filter(
      (key) => !found[key]
    );

    if (missing.length === 0) {
      break;
    }

    console.warn(`Waiting for ${missing.join(', ')}`);
    await sleep(20_000);
  }

  return found;
}

/** Vercel's GitHub integration sets each deployment's environment_url. */
async function vercelDeployments() {
  const deployments = {};

  for (const deployment of await github(`/repos/${GITHUB_REPOSITORY}/deployments?sha=${HEAD_SHA}&per_page=100`)) {
    const app = deployment.environment.match(/storybook-(astro\d-server-vercel)/)?.[1];

    if (!app || deployments[app]) {
      continue;
    }

    const [latest] = await github(deployment.statuses_url.replace('https://api.github.com', ''));

    if (latest?.state === 'success' && latest.environment_url) {
      deployments[app] = latest.environment_url;
    }
  }

  return deployments;
}

/** Chromatic publishes each static Storybook and links it from its commit status. */
async function chromaticStorybooks() {
  const storybooks = {};

  for (const status of await github(`/repos/${GITHUB_REPOSITORY}/commits/${HEAD_SHA}/statuses?per_page=100`)) {
    const astro = status.context.match(/^Storybook Publish: storybook-astro-(\d)$/)?.[1];

    if (astro && status.state === 'success' && status.target_url) {
      storybooks[`astro${astro}-static`] = status.target_url;
    }
  }

  return storybooks;
}

function renderComment(deployments) {
  const link = (key, label = 'Storybook') => (deployments[key] ? `[${label}](${deployments[key]})` : '—');
  const rows = ASTRO_VERSIONS.map(
    (astro) =>
      `| Astro ${astro} | ${link(`astro${astro}-static`)} | ${link(`astro${astro}-server-vercel`)} | ${link(
        `astro${astro}-server-cloudflare`
      )} | ${link(`astro${astro}-server-netlify`)} |`
  );

  return [
    MARKER,
    `### Storybook deployments for ${HEAD_SHA.slice(0, 7)}`,
    '',
    '| | Static (prerendered) | Server · Vercel | Server · Cloudflare Workers | Server · Netlify |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    '',
    `— means the build didn't report a URL in time; see [the run](${RUN_URL}).`
  ].join('\n');
}

async function upsertComment(body) {
  const comments = await github(`/repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments?per_page=100`);
  const existing = comments.find((comment) => comment.body?.startsWith(MARKER));

  if (existing) {
    await github(`/repos/${GITHUB_REPOSITORY}/issues/comments/${existing.id}`, { method: 'PATCH', body });
  } else {
    await github(`/repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments`, { method: 'POST', body });
  }
}

async function github(path, { method = 'GET', body } = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      authorization: `Bearer ${GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify({ body }) } : {})
  });

  if (!response.ok) {
    throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
  }

  return response.json();
}
