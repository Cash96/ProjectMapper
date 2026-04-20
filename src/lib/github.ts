import { appConfig } from "@/lib/config";

type GitHubRepositoryApiResponse = {
  full_name: string;
  html_url: string;
  default_branch: string;
  visibility?: string;
  private: boolean;
  archived: boolean;
  open_issues_count: number;
  pushed_at: string | null;
};

type GitHubBranchApiResponse = {
  name: string;
  commit: {
    sha: string;
  };
};

type GitHubTreeApiResponse = {
  tree: Array<{
    path: string;
    type: "blob" | "tree";
  }>;
};

type GitHubContentApiResponse = {
  content?: string;
  encoding?: string;
};

export type GitHubRepositoryInspection = {
  owner: string;
  repo: string;
  fullName: string;
  htmlUrl: string;
  defaultBranch: string;
  visibility: string;
  archived: boolean;
  openIssuesCount: number;
  pushedAt: string | null;
  latestCommitSha: string | null;
  verifiedAt: string;
  tokenConfigured: boolean;
  reachable: boolean;
  error?: string;
};

function normalizeRepositoryUrl(url: string) {
  return url.replace(/\.git$/, "").replace(/\/$/, "");
}

function getGitHubToken(url: string) {
  const normalizedUrl = normalizeRepositoryUrl(url);
  const repoAUrl = normalizeRepositoryUrl(appConfig.repositories.repoA);
  const repoBUrl = normalizeRepositoryUrl(appConfig.repositories.repoB);

  if (normalizedUrl === repoAUrl) {
    return appConfig.repositoryTokens.repoA || appConfig.repositoryTokens.default;
  }

  if (normalizedUrl === repoBUrl) {
    return appConfig.repositoryTokens.repoB || appConfig.repositoryTokens.default;
  }

  return appConfig.repositoryTokens.default;
}

function getGitHubHeaders(url: string) {
  const headers = new Headers({
    Accept: "application/vnd.github+json",
    "User-Agent": "ProjectMapper",
    "X-GitHub-Api-Version": "2022-11-28",
  });

  const token = getGitHubToken(url)?.trim();

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return headers;
}

export function parseGitHubRepositoryUrl(url: string) {
  const parsed = new URL(url);
  const cleanedPath = parsed.pathname.replace(/\.git$/, "").replace(/^\//, "");
  const [owner, repo] = cleanedPath.split("/");

  if (!owner || !repo) {
    throw new Error(`Unsupported GitHub repository URL: ${url}`);
  }

  return { owner, repo };
}

function formatGitHubError(status: number, payload: unknown, tokenConfigured: boolean) {
  const apiMessage =
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof payload.message === "string"
      ? payload.message
      : null;

  if (status === 401 || status === 403) {
    return "GitHub rejected the configured token. Update GITHUB_TOKEN with a valid token that can read both repositories.";
  }

  if (status === 404) {
    if (!tokenConfigured) {
      return "GitHub could not access this repository. Add GITHUB_TOKEN with read access to private repositories and try again.";
    }

    return "GitHub could not access this repository with the current token. Confirm the repo URL and that GITHUB_TOKEN can read it.";
  }

  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return `${status} ${payload.message}`;
  }

  return `${status} GitHub API request failed`;
}

async function fetchGitHubJson<T>(url: string, path: string, tokenConfigured: boolean) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: getGitHubHeaders(url),
    cache: "no-store",
  });

  if (!response.ok) {
    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    throw new Error(formatGitHubError(response.status, payload, tokenConfigured));
  }

  return response.json() as Promise<T>;
}

export async function getGitHubRepositoryTree(url: string, ref?: string) {
  const { owner, repo } = parseGitHubRepositoryUrl(url);
  const tokenConfigured = Boolean(getGitHubToken(url));
  const branchOrSha = ref || "HEAD";
  const tree = await fetchGitHubJson<GitHubTreeApiResponse>(
    url,
    `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branchOrSha)}?recursive=1`,
    tokenConfigured,
  );

  return tree.tree;
}

export async function getGitHubRepositoryFileText(url: string, path: string, ref?: string) {
  const { owner, repo } = parseGitHubRepositoryUrl(url);
  const tokenConfigured = Boolean(getGitHubToken(url));
  const encodedPath = path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  const refQuery = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  const content = await fetchGitHubJson<GitHubContentApiResponse>(
    url,
    `/repos/${owner}/${repo}/contents/${encodedPath}${refQuery}`,
    tokenConfigured,
  );

  if (!content.content || content.encoding !== "base64") {
    return null;
  }

  return Buffer.from(content.content.replace(/\n/g, ""), "base64").toString("utf8");
}

export async function inspectGitHubRepository(url: string): Promise<GitHubRepositoryInspection> {
  const { owner, repo } = parseGitHubRepositoryUrl(url);
  const tokenConfigured = Boolean(getGitHubToken(url));
  const verifiedAt = new Date().toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  try {
    const repository = await fetchGitHubJson<GitHubRepositoryApiResponse>(
      url,
      `/repos/${owner}/${repo}`,
      tokenConfigured,
    );
    const branch = await fetchGitHubJson<GitHubBranchApiResponse>(
      url,
      `/repos/${owner}/${repo}/branches/${encodeURIComponent(repository.default_branch)}`,
      tokenConfigured,
    );

    return {
      owner,
      repo,
      fullName: repository.full_name,
      htmlUrl: repository.html_url,
      defaultBranch: repository.default_branch,
      visibility: repository.visibility ?? (repository.private ? "private" : "public"),
      archived: repository.archived,
      openIssuesCount: repository.open_issues_count,
      pushedAt: repository.pushed_at,
      latestCommitSha: branch.commit.sha,
      verifiedAt,
      tokenConfigured,
      reachable: true,
    };
  } catch (error) {
    return {
      owner,
      repo,
      fullName: `${owner}/${repo}`,
      htmlUrl: url.replace(/\.git$/, ""),
      defaultBranch: "unknown",
      visibility: "unknown",
      archived: false,
      openIssuesCount: 0,
      pushedAt: null,
      latestCommitSha: null,
      verifiedAt,
      tokenConfigured,
      reachable: false,
      error: error instanceof Error ? error.message : "Unknown GitHub error",
    };
  }
}