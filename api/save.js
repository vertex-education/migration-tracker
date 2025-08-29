// api/save.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { owner, repo, path, branch = "main", data } = req.body || {};
    if (!owner || !repo || !path || !data) {
      return res.status(400).json({ error: "Missing owner/repo/path/data" });
    }

    // 1) Get current file SHA
    const ghHeaders = {
      "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "User-Agent": "migration-tracker-app"
    };

    const metaResp = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`,
      { headers: ghHeaders }
    );

    if (!metaResp.ok && metaResp.status !== 404) {
      const t = await metaResp.text();
      return res.status(metaResp.status).json({ error: "Failed to get file metadata", details: t });
    }

    const meta = metaResp.status === 404 ? null : await metaResp.json();
    const sha = meta?.sha;

    // 2) Commit new content
    const content = Buffer.from(JSON.stringify(data, null, 2) + "\n", "utf8").toString("base64");

    const putResp = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
      {
        method: "PUT",
        headers: ghHeaders,
        body: JSON.stringify({
          message: "Admin update via Migration Tracker",
          content,
          branch,
          ...(sha ? { sha } : {})
        })
      }
    );

    if (!putResp.ok) {
      const t = await putResp.text();
      return res.status(putResp.status).json({ error: "GitHub save failed", details: t });
    }

    const result = await putResp.json();
    // Avoid caching
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ok: true, commit: result.commit?.sha });
  } catch (err) {
    return res.status(500).json({ error: "Server error", details: String(err) });
  }
}
