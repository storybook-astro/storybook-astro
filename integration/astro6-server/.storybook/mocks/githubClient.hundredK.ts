// A replacement-path mock (`mock(specifier, './path')`): the server build
// compiles it in, and story rules switch to it for one render.
export async function fetchGithubRepositoryStats() {
  return { stargazersCount: 100000 };
}
