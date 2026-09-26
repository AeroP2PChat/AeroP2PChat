export function isValidReleaseAssetUrl(value, repo, expectedAssetName) {
  if (!value || !repo || !expectedAssetName) return false;
  try {
    const url = new URL(value);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const expectedPrefix = [...repo.split("/"), "releases", "download"];
    return (
      url.protocol === "https:" &&
      url.hostname === "github.com" &&
      expectedPrefix.every((part, index) => pathParts[index] === part) &&
      pathParts.length === expectedPrefix.length + 2 &&
      decodeURIComponent(pathParts.at(-1)) === expectedAssetName
    );
  } catch {
    return false;
  }
}

export function hasValidUpdateChecksums(sha256, sha512) {
  return (
    /^[a-f0-9]{64}$/i.test(String(sha256 || "")) &&
    /^[A-Za-z0-9+/]{86}==$/.test(String(sha512 || ""))
  );
}
