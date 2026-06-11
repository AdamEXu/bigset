import { chromium, type Browser, type Page } from "playwright-core";

import { getSignal } from "../abort-registry.js";
import { convex, internal } from "../convex.js";
import { FETCH_TIMEOUT_MS } from "../fetch-timeout.js";
import { getTinyFishApiKey, tinyFishHeaders } from "../local-credentials.js";
import type { PopulateColumn } from "../pipeline/populate.js";

type ExtractorStatus = "inserted" | "miss" | "failed";

export interface TryRowExtractorInput {
  datasetId: string;
  columns: PopulateColumn[];
  primaryKeys: Record<string, string>;
  urls?: string[];
  context?: string;
}

export interface TryRowExtractorResult {
  status: ExtractorStatus;
  reason: string;
  rowSummary?: string;
  sources?: string[];
}

interface TinyFishBrowserSession {
  session_id: string;
  cdp_url: string;
  base_url: string;
}

interface GitHubRepoFacts {
  owner: string;
  repo: string;
  fullName: string;
  url: string;
  description?: string;
  stars?: number;
  forks?: number;
  watchers?: number;
  issues?: number;
  pullRequests?: number;
  language?: string;
  license?: string;
  latestCommitAt?: string;
  updatedAt?: string;
  createdAt?: string;
  homepage?: string;
  archived?: boolean;
}

interface RawGitHubRepoDomFacts {
  description?: string;
  stars?: string;
  forks?: string;
  watchers?: string;
  issues?: string;
  pullRequests?: string;
  language?: string;
  license?: string;
  latestCommitAt?: string;
  homepage?: string;
  archived?: boolean;
}

const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);
const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);
const BROWSER_TIMEOUT_MS = 45_000;
const CDP_CONNECT_TIMEOUT_MS = 45_000;
const BROWSER_ATTEMPTS = 2;

export async function tryRowExtractor(
  input: TryRowExtractorInput,
): Promise<TryRowExtractorResult> {
  if (!ENABLED_VALUES.has((process.env.ROW_EXTRACTORS_ENABLED ?? "").toLowerCase())) {
    return { status: "miss", reason: "row extractors are disabled" };
  }

  const url = firstCandidateUrl(input);
  if (!url) return { status: "miss", reason: "no URL primary key or candidate URL" };

  const repoRef = parseGitHubRepoUrl(url);
  if (!repoRef) {
    return { status: "miss", reason: `unsupported URL host: ${safeHost(url)}` };
  }

  try {
    const facts = await extractGitHubRepoFacts(url, input.datasetId);
    const row = buildGitHubRow(input.columns, input.primaryKeys, facts);
    if (!row) {
      return {
        status: "miss",
        reason: "GitHub extractor could not satisfy all requested columns",
      };
    }

    await convex.mutation(internal.datasetRows.insert, {
      datasetId: input.datasetId,
      data: row,
      sources: [facts.url],
      rowSummary: facts.description
        ? `${facts.fullName}: ${facts.description}`
        : facts.fullName,
      howFound:
        "Opened the GitHub repository URL with TinyFish Browser and extracted repository facts from the rendered page.",
    });

    return {
      status: "inserted",
      reason: "Inserted by GitHub row extractor",
      rowSummary: facts.description
        ? `${facts.fullName}: ${facts.description}`
        : facts.fullName,
      sources: [facts.url],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/duplicate/i.test(msg)) {
      return {
        status: "miss",
        reason: `${msg} Move on to the next entity.`,
      };
    }
    return { status: "failed", reason: msg };
  }
}

function firstCandidateUrl(input: TryRowExtractorInput): string | undefined {
  const fromPrimaryKey = Object.values(input.primaryKeys).find((value) =>
    isHttpUrl(value),
  );
  if (fromPrimaryKey) return normalizeUrl(fromPrimaryKey);

  const fromUrls = input.urls?.find(isHttpUrl);
  if (fromUrls) return normalizeUrl(fromUrls);

  const fromContext = input.context?.match(/https?:\/\/[^\s)>"']+/i)?.[0];
  return fromContext ? normalizeUrl(fromContext) : undefined;
}

function normalizeUrl(value: string): string {
  return value.trim().replace(/[.,;:]+$/, "");
}

function isHttpUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const parsed = new URL(normalizeUrl(value));
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function safeHost(value: string): string {
  try {
    return new URL(value).host;
  } catch {
    return "invalid-url";
  }
}

function parseGitHubRepoUrl(value: string): { owner: string; repo: string } | null {
  try {
    const url = new URL(value);
    if (!GITHUB_HOSTS.has(url.hostname.toLowerCase())) return null;
    const [owner, repo] = url.pathname
      .split("/")
      .filter(Boolean)
      .map((part) => part.trim());
    if (!owner || !repo) return null;
    if (["orgs", "topics", "marketplace", "features"].includes(owner)) return null;
    return { owner, repo: repo.replace(/\.git$/i, "") };
  } catch {
    return null;
  }
}

async function extractGitHubRepoFacts(
  url: string,
  datasetId: string,
): Promise<GitHubRepoFacts> {
  const apiKey = await getTinyFishApiKey();
  if (!apiKey) throw new Error("TINYFISH_API_KEY is not configured");

  let lastError: unknown;
  for (let attempt = 1; attempt <= BROWSER_ATTEMPTS; attempt++) {
    try {
      return await extractGitHubRepoFactsOnce(apiKey, url, datasetId);
    } catch (err) {
      lastError = err;
      if (getSignal(datasetId)?.aborted || attempt === BROWSER_ATTEMPTS) break;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[row_extractor] GitHub browser attempt ${attempt} failed; retrying: ${msg}`,
      );
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function extractGitHubRepoFactsOnce(
  apiKey: string,
  url: string,
  datasetId: string,
): Promise<GitHubRepoFacts> {
  const session = await createTinyFishBrowserSession(apiKey, url, datasetId);
  let browser: Browser | undefined;
  try {
    browser = await chromium.connectOverCDP(session.cdp_url, {
      timeout: CDP_CONNECT_TIMEOUT_MS,
    });
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: BROWSER_TIMEOUT_MS,
    });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {
      // GitHub may keep long-lived requests open. DOMContentLoaded is enough.
    });
    return await readGitHubRepoFacts(page);
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

async function createTinyFishBrowserSession(
  apiKey: string,
  url: string,
  datasetId: string,
): Promise<TinyFishBrowserSession> {
  const response = await withRunTimeoutSignal(datasetId, FETCH_TIMEOUT_MS, (signal) =>
    fetch("https://agent.tinyfish.ai/v1/browser", {
      method: "POST",
      headers: {
        ...tinyFishHeaders(apiKey),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ url }),
      signal,
    }),
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `TinyFish Browser returned HTTP ${response.status}: ${body.slice(0, 200)}`,
    );
  }

  const data = (await response.json()) as Partial<TinyFishBrowserSession>;
  if (!data.session_id || !data.cdp_url || !data.base_url) {
    throw new Error("TinyFish Browser response did not include CDP connection details");
  }

  return {
    session_id: data.session_id,
    cdp_url: data.cdp_url,
    base_url: data.base_url,
  };
}

async function withRunTimeoutSignal<T>(
  datasetId: string,
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const runSignal = getSignal(datasetId);
  if (runSignal?.aborted) throw new DOMException("Run was stopped", "AbortError");

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new DOMException("Timed out", "TimeoutError")),
    timeoutMs,
  );
  const abortFromRun = () =>
    controller.abort(runSignal?.reason ?? new DOMException("Run was stopped", "AbortError"));

  runSignal?.addEventListener("abort", abortFromRun, { once: true });
  try {
    return await operation(controller.signal);
  } finally {
    clearTimeout(timeout);
    runSignal?.removeEventListener("abort", abortFromRun);
  }
}

async function readGitHubRepoFacts(page: Page): Promise<GitHubRepoFacts> {
  const url = page.url();
  const repoRef = parseGitHubRepoUrl(url);
  if (!repoRef) throw new Error(`Not a GitHub repository page: ${url}`);

  const facts = (await page.evaluate(`
    (() => {
      const text = (selector) =>
        document.querySelector(selector)?.textContent?.trim() || undefined;
      const attr = (selector, name) =>
        document.querySelector(selector)?.getAttribute(name) || undefined;
      const firstCandidateText = (selector, predicate) =>
        Array.from(document.querySelectorAll(selector))
          .map((el) => el.textContent?.trim())
          .filter(Boolean)
          .find((value) => !predicate || predicate(value));
      const language = () =>
        text("[itemprop=\\"programmingLanguage\\"]") ??
        text("a[href*=\\"search?l=\\"] span.color-fg-default.text-bold") ??
        text("a[href*=\\"search?l=\\"] .text-bold");
      const license = () =>
        firstCandidateText(
          "a[href*=\\"LICENSE\\"], a[href*=\\"license\\"], [data-testid*=\\"license\\"]",
          (value) => /licensed|MIT|Apache|BSD|GPL|MPL|ISC/i.test(value),
        ) ??
        firstCandidateText(
          "a[href*=\\"LICENSE\\"], a[href*=\\"license\\"], [data-testid*=\\"license\\"]",
          (value) => !/^(license|view license)$/i.test(value),
        ) ??
        firstCandidateText(
          "a[href*=\\"LICENSE\\"], a[href*=\\"license\\"], [data-testid*=\\"license\\"]",
        ) ??
        text("svg.octicon-law + span");
      const bodyText = document.body?.innerText ?? "";

      return {
        description:
          text("[data-pjax=\\"#repo-content-pjax-container\\"] [itemprop=\\"about\\"]") ??
          text("[itemprop=\\"about\\"]") ??
          attr("meta[name='description']", "content"),
        stars:
          text("#repo-stars-counter-star") ??
          text("a[href$='/stargazers'] strong") ??
          text("a[href$='/stargazers']"),
        forks:
          text("#repo-network-counter") ??
          text("a[href$='/forks'] strong") ??
          text("a[href$='/forks']"),
        watchers:
          text("a[href$='/watchers'] strong") ??
          text("a[href$='/watchers']"),
        issues:
          text("#issues-tab span.Counter") ??
          text("a[href$=\\"/issues\\"] span.Counter") ??
          text("a[data-tab-item=\\"i1issues-tab\\"] span.Counter"),
        pullRequests:
          text("#pull-requests-tab span.Counter") ??
          text("a[href$=\\"/pulls\\"] span.Counter") ??
          text("a[data-tab-item=\\"i2pull-requests-tab\\"] span.Counter"),
        language: language(),
        license: license(),
        latestCommitAt:
          attr("relative-time[datetime]", "datetime") ??
          attr("time-ago[datetime]", "datetime"),
        homepage: attr("[itemprop='url']", "href"),
        archived: /This repository has been archived/i.test(bodyText),
      };
    })()
  `)) as RawGitHubRepoDomFacts;

  const apiFacts = await fetchGitHubApiFacts(page, repoRef.owner, repoRef.repo).catch(
    () => undefined,
  );

  return {
    owner: repoRef.owner,
    repo: repoRef.repo,
    fullName: `${repoRef.owner}/${repoRef.repo}`,
    url,
    description: apiFacts?.description ?? cleanOptionalText(facts.description),
    stars: apiFacts?.stars ?? parseCompactNumber(facts.stars),
    forks: apiFacts?.forks ?? parseCompactNumber(facts.forks),
    watchers: apiFacts?.watchers ?? parseCompactNumber(facts.watchers),
    issues: parseCompactNumber(facts.issues) ?? apiFacts?.issues,
    pullRequests: parseCompactNumber(facts.pullRequests) ?? apiFacts?.pullRequests,
    language: apiFacts?.language ?? cleanOptionalText(facts.language),
    license: apiFacts?.license ?? cleanOptionalText(facts.license),
    latestCommitAt: apiFacts?.latestCommitAt ?? facts.latestCommitAt,
    updatedAt: apiFacts?.updatedAt,
    createdAt: apiFacts?.createdAt,
    homepage: apiFacts?.homepage ?? cleanOptionalText(facts.homepage),
    archived: apiFacts?.archived ?? facts.archived,
  };
}

async function fetchGitHubApiFacts(
  page: Page,
  owner: string,
  repo: string,
): Promise<Partial<GitHubRepoFacts>> {
  const response = await page.request.get(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
      },
      timeout: FETCH_TIMEOUT_MS,
    },
  );
  if (!response.ok()) {
    throw new Error(`GitHub API returned HTTP ${response.status()}`);
  }

  const data = (await response.json()) as {
    description?: string | null;
    stargazers_count?: number;
    forks_count?: number;
    watchers_count?: number;
    open_issues_count?: number;
    language?: string | null;
    license?: { spdx_id?: string | null; name?: string | null } | null;
    pushed_at?: string | null;
    updated_at?: string | null;
    created_at?: string | null;
    homepage?: string | null;
    archived?: boolean;
    html_url?: string;
  };

  return {
    url: data.html_url,
    description: data.description ?? undefined,
    stars: data.stargazers_count,
    forks: data.forks_count,
    watchers: data.watchers_count,
    issues: data.open_issues_count,
    language: data.language ?? undefined,
    license: data.license?.spdx_id || data.license?.name || undefined,
    latestCommitAt: data.pushed_at ?? undefined,
    updatedAt: data.updated_at ?? undefined,
    createdAt: data.created_at ?? undefined,
    homepage: data.homepage || undefined,
    archived: data.archived,
  };
}

function buildGitHubRow(
  columns: PopulateColumn[],
  primaryKeys: Record<string, string>,
  facts: GitHubRepoFacts,
): Record<string, string | number | boolean> | null {
  const row: Record<string, string | number | boolean> = {};

  for (const column of columns) {
    const pkValue = findPrimaryKeyValue(column.name, primaryKeys);
    const rawValue = pkValue ?? valueForGitHubColumn(column.name, facts);
    const value = coerceColumnValue(rawValue, column);
    if (value === undefined) return null;
    row[column.name] = value;
  }

  return row;
}

function findPrimaryKeyValue(
  columnName: string,
  primaryKeys: Record<string, string>,
): string | undefined {
  if (primaryKeys[columnName]) return primaryKeys[columnName];
  const normalizedColumn = normalizeFieldName(columnName);
  const entry = Object.entries(primaryKeys).find(
    ([key]) => normalizeFieldName(key) === normalizedColumn,
  );
  return entry?.[1];
}

function valueForGitHubColumn(
  columnName: string,
  facts: GitHubRepoFacts,
): string | number | boolean | undefined {
  const normalized = normalizeFieldName(columnName);
  if (matches(normalized, ["repository_url", "repo_url", "github_url", "url", "link"])) {
    return facts.url;
  }
  if (matches(normalized, ["repository_name", "repo_name"])) {
    return facts.fullName;
  }
  if (matches(normalized, ["repository", "repo", "name"])) {
    return facts.repo;
  }
  if (matches(normalized, ["full_name", "repository_full_name", "repo_full_name"])) {
    return facts.fullName;
  }
  if (matches(normalized, ["owner", "organization", "org", "user"])) {
    return facts.owner;
  }
  if (matches(normalized, ["description", "summary", "about"])) {
    return facts.description;
  }
  if (matches(normalized, ["stars", "star_count", "stargazers", "stargazer_count"])) {
    return facts.stars;
  }
  if (matches(normalized, ["forks", "fork_count"])) {
    return facts.forks;
  }
  if (matches(normalized, ["watchers", "watcher_count"])) {
    return facts.watchers;
  }
  if (matches(normalized, ["issues", "open_issues", "open_issue_count"])) {
    return facts.issues;
  }
  if (matches(normalized, ["pull_requests", "open_pull_requests", "prs", "open_prs", "pr_count", "open_pr_count"])) {
    return facts.pullRequests;
  }
  if (matches(normalized, ["language", "primary_language"])) {
    return facts.language;
  }
  if (matches(normalized, ["license", "license_type", "license_spdx"])) {
    return facts.license;
  }
  if (matches(normalized, ["latest_commit", "latest_commit_at", "last_commit", "pushed_at", "activity", "last_activity"])) {
    return facts.latestCommitAt;
  }
  if (matches(normalized, ["updated", "updated_at", "last_updated"])) {
    return facts.updatedAt;
  }
  if (matches(normalized, ["created", "created_at"])) {
    return facts.createdAt;
  }
  if (matches(normalized, ["homepage", "website", "site"])) {
    return facts.homepage;
  }
  if (matches(normalized, ["archived", "is_archived"])) {
    return facts.archived;
  }
  return undefined;
}

function coerceColumnValue(
  value: string | number | boolean | undefined,
  column: PopulateColumn,
): string | number | boolean | undefined {
  if (value === undefined || value === "") return undefined;
  switch (column.type) {
    case "number": {
      if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
      const parsed = Number(String(value).replace(/,/g, ""));
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    case "boolean":
      if (typeof value === "boolean") return value;
      if (/^(true|yes)$/i.test(String(value))) return true;
      if (/^(false|no)$/i.test(String(value))) return false;
      return undefined;
    case "url":
      return isHttpUrl(String(value)) ? normalizeUrl(String(value)) : undefined;
    case "date": {
      const date = new Date(String(value));
      return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
    }
    case "text":
      return String(value).trim();
  }
}

function parseCompactNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = value.replace(/,/g, "").match(/([\d.]+)\s*([kmb])?/i);
  if (!match) return undefined;
  const base = Number(match[1]);
  if (!Number.isFinite(base)) return undefined;
  const suffix = match[2]?.toLowerCase();
  const multiplier = suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : suffix === "b" ? 1_000_000_000 : 1;
  return Math.round(base * multiplier);
}

function cleanOptionalText(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function normalizeFieldName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function matches(value: string, candidates: string[]): boolean {
  return candidates.includes(value);
}
