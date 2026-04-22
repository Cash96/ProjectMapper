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
  sha?: string;
  content?: string;
  encoding?: string;
};

type GitHubRefCreateResponse = {
  ref: string;
  object: {
    sha: string;
  };
};

type GitHubContentWriteResponse = {
  content: {
    path: string;
    sha: string;
  };
  commit: {
    sha: string;
    message: string;
  };
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

function getRepositoryIdentityKey(url: string) {
  try {
    const { owner, repo } = parseGitHubRepositoryUrl(url);
    return `${owner.toLowerCase()}/${repo.toLowerCase()}`;
  } catch {
    return normalizeRepositoryUrl(url).toLowerCase();
  }
}

function getGitHubToken(url: string) {
  const repositoryKey = getRepositoryIdentityKey(url);
  const repoAKey = getRepositoryIdentityKey(appConfig.repositories.repoA);
  const repoBKey = getRepositoryIdentityKey(appConfig.repositories.repoB);

  if (repositoryKey === repoAKey) {
    return appConfig.repositoryTokens.repoA || appConfig.repositoryTokens.default;
  }

  if (repositoryKey === repoBKey) {
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
  return fetchGitHubJsonWithInit<T>(url, path, tokenConfigured, undefined);
}

async function fetchGitHubJsonWithInit<T>(
  url: string,
  path: string,
  tokenConfigured: boolean,
  init: RequestInit | undefined,
) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: getGitHubHeaders(url),
    cache: "no-store",
    ...init,
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

async function fetchGitHubResponse(url: string, path: string, init?: RequestInit) {
  const tokenConfigured = Boolean(getGitHubToken(url));
  const response = await fetch(`https://api.github.com${path}`, {
    headers: getGitHubHeaders(url),
    cache: "no-store",
    ...init,
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

  return response;
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
  const snapshot = await getGitHubRepositoryFileSnapshot(url, path, ref);
  return snapshot?.text ?? null;
}

export async function getGitHubRepositoryFileSnapshot(url: string, path: string, ref?: string) {
  const { owner, repo } = parseGitHubRepositoryUrl(url);
  const tokenConfigured = Boolean(getGitHubToken(url));
  const encodedPath = path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  const refQuery = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  try {
    const content = await fetchGitHubJson<GitHubContentApiResponse>(
      url,
      `/repos/${owner}/${repo}/contents/${encodedPath}${refQuery}`,
      tokenConfigured,
    );

    if (!content.content || content.encoding !== "base64") {
      return {
        path,
        sha: content.sha ?? null,
        text: null,
      };
    }

    return {
      path,
      sha: content.sha ?? null,
      text: Buffer.from(content.content.replace(/\n/g, ""), "base64").toString("utf8"),
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("404")) {
      return null;
    }

    throw error;
  }
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

export async function createGitHubBranch(url: string, branchName: string, baseBranch = "main") {
  const { owner, repo } = parseGitHubRepositoryUrl(url);
  const tokenConfigured = Boolean(getGitHubToken(url));
  const branch = await fetchGitHubJson<GitHubBranchApiResponse>(
    url,
    `/repos/${owner}/${repo}/branches/${encodeURIComponent(baseBranch)}`,
    tokenConfigured,
  );

  try {
    const created = await fetchGitHubJsonWithInit<GitHubRefCreateResponse>(
      url,
      `/repos/${owner}/${repo}/git/refs`,
      tokenConfigured,
      {
        method: "POST",
        body: JSON.stringify({
          ref: `refs/heads/${branchName}`,
          sha: branch.commit.sha,
        }),
      },
    );

    return {
      branchName,
      sha: created.object.sha,
      created: true,
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("422")) {
      return {
        branchName,
        sha: branch.commit.sha,
        created: false,
      };
    }

    throw error;
  }
}

export async function commitGitHubFileChange(input: {
  url: string;
  branch: string;
  path: string;
  content: string;
  message: string;
}) {
  const { owner, repo } = parseGitHubRepositoryUrl(input.url);
  const snapshot = await getGitHubRepositoryFileSnapshot(input.url, input.path, input.branch);

  if (snapshot?.text === input.content) {
    return null;
  }

  const encodedPath = input.path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  const response = await fetchGitHubJsonWithInit<GitHubContentWriteResponse>(
    input.url,
    `/repos/${owner}/${repo}/contents/${encodedPath}`,
    Boolean(getGitHubToken(input.url)),
    {
      method: "PUT",
      body: JSON.stringify({
        message: input.message,
        content: Buffer.from(input.content, "utf8").toString("base64"),
        branch: input.branch,
        sha: snapshot?.sha ?? undefined,
      }),
    },
  );

  return {
    path: response.content.path,
    sha: response.commit.sha,
    message: response.commit.message,
  };
}

export async function deleteGitHubFile(input: {
  url: string;
  branch: string;
  path: string;
  message: string;
}) {
  const { owner, repo } = parseGitHubRepositoryUrl(input.url);
  const snapshot = await getGitHubRepositoryFileSnapshot(input.url, input.path, input.branch);

  if (!snapshot?.sha) {
    return null;
  }

  const encodedPath = input.path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  const response = await fetchGitHubResponse(
    input.url,
    `/repos/${owner}/${repo}/contents/${encodedPath}`,
    {
      method: "DELETE",
      body: JSON.stringify({
        message: input.message,
        branch: input.branch,
        sha: snapshot.sha,
      }),
    },
  );

  const payload = await response.json() as GitHubContentWriteResponse;
  return {
    path: input.path,
    sha: payload.commit.sha,
    message: payload.commit.message,
  };
}