"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createIntegration, revokeIntegration } from "@/app/actions/integrations";

const KIND_LABELS = { crawlproof: "Crawlproof", outrank: "Outrank" };

export function IntegrationsManager({ initial }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [items, setItems] = useState(initial);
  const [kind, setKind] = useState("crawlproof");
  const [name, setName] = useState("Crawlproof");
  const [origin, setOrigin] = useState("");
  const [revealed, setRevealed] = useState({});
  const [copied, setCopied] = useState(null);
  const [error, setError] = useState(null);
  const [justCreatedToken, setJustCreatedToken] = useState(null);

  useEffect(() => { setOrigin(window.location.origin); }, []);

  const onCreate = (e) => {
    e.preventDefault();
    setError(null);
    setJustCreatedToken(null);
    start(async () => {
      const res = await createIntegration({ name, kind });
      if (!res.ok) { setError(res.error); return; }
      setJustCreatedToken(res.accessToken);
      setName(kind === "crawlproof" ? "Crawlproof" : "Outrank");
      router.refresh();
    });
  };

  const onRevoke = (it) => {
    if (!confirm(`Revoke "${it.name}"? The source will stop being able to publish.`)) return;
    start(async () => {
      const res = await revokeIntegration({ id: it.id });
      if (!res.ok) { setError(res.error); return; }
      setItems((prev) => prev.filter((i) => i.id !== it.id));
      router.refresh();
    });
  };

  const copy = (key, text) => {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const webhookUrl = `${origin}/api/autoblog`;
  const mutedColor = "var(--color-text-secondary)";
  const borderColor = "var(--color-border)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div>
        <p style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em", color: mutedColor, marginBottom: "0.5rem" }}>
          Webhook endpoint
        </p>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <code style={{ flex: 1, wordBreak: "break-all", borderRadius: "0.375rem", border: `1px solid ${borderColor}`, background: "var(--color-bg-secondary)", padding: "0.5rem 0.75rem", fontSize: "0.75rem" }}>
            {webhookUrl || "https://qrypt.chat/api/autoblog"}
          </code>
          <button type="button" onClick={() => copy("url", webhookUrl)}
            style={{ padding: "0.5rem 0.75rem", fontSize: "0.875rem", border: `1px solid ${borderColor}`, borderRadius: "0.375rem", cursor: "pointer" }}>
            {copied === "url" ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <form onSubmit={onCreate}>
        <p style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em", color: mutedColor, marginBottom: "0.5rem" }}>
          Generate token
        </p>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <select value={kind} onChange={(e) => { setKind(e.target.value); setName(e.target.value === "crawlproof" ? "Crawlproof" : "Outrank"); }}
            style={{ padding: "0.5rem 0.75rem", fontSize: "0.875rem", border: `1px solid ${borderColor}`, borderRadius: "0.375rem", background: "var(--color-bg)" }}>
            <option value="crawlproof">Crawlproof</option>
            <option value="outrank">Outrank</option>
          </select>
          <input style={{ flex: 1, minWidth: "160px", padding: "0.5rem 0.75rem", fontSize: "0.875rem", border: `1px solid ${borderColor}`, borderRadius: "0.375rem", background: "var(--color-bg)" }}
            type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Integration name" maxLength={100} required />
          <button type="submit" disabled={pending}
            style={{ padding: "0.5rem 1rem", fontSize: "0.875rem", fontWeight: 500, background: "var(--color-accent)", color: "#fff", border: "none", borderRadius: "0.375rem", cursor: "pointer", opacity: pending ? 0.5 : 1 }}>
            {pending ? "…" : "Generate"}
          </button>
        </div>
        {error && <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", color: "#ef4444" }}>{error}</p>}
        {justCreatedToken && (
          <div style={{ marginTop: "0.75rem", borderRadius: "0.375rem", border: "1px solid rgba(34,197,94,0.4)", background: "rgba(34,197,94,0.05)", padding: "0.75rem" }}>
            <p style={{ marginBottom: "0.5rem", fontSize: "0.75rem", fontWeight: 600, color: "#16a34a" }}>
              Token created — copy now and paste into CrawlProof autoblog webhook settings.
            </p>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <code style={{ flex: 1, wordBreak: "break-all", fontSize: "0.75rem" }}>{justCreatedToken}</code>
              <button type="button" onClick={() => copy("new", justCreatedToken)}
                style={{ padding: "0.25rem 0.5rem", border: `1px solid ${borderColor}`, borderRadius: "0.25rem", fontSize: "0.75rem", cursor: "pointer" }}>
                {copied === "new" ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        )}
      </form>

      <div>
        <p style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em", color: mutedColor, marginBottom: "0.5rem" }}>
          Access tokens ({items.length})
        </p>
        {items.length === 0 ? (
          <p style={{ fontSize: "0.875rem", color: mutedColor }}>None yet — generate one above.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {items.map((it) => {
              const show = !!revealed[it.id];
              const masked = `${it.access_token.slice(0, 8)}…${it.access_token.slice(-4)}`;
              return (
                <li key={it.id} style={{ borderRadius: "0.375rem", border: `1px solid ${borderColor}`, padding: "0.75rem", fontSize: "0.875rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "0.5rem" }}>
                        <span style={{ fontWeight: 500 }}>{it.name}</span>
                        <span style={{ fontSize: "0.7rem", padding: "0.1rem 0.4rem", borderRadius: "0.25rem", background: "var(--color-bg-secondary)" }}>
                          {KIND_LABELS[it.kind] ?? it.kind}
                        </span>
                        <span style={{ fontSize: "0.75rem", color: mutedColor }}>
                          {it.request_count} requests
                          {it.last_used_at && ` · last ${new Date(it.last_used_at).toLocaleString()}`}
                        </span>
                      </div>
                      <div style={{ marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <code style={{ flex: 1, wordBreak: "break-all", borderRadius: "0.25rem", border: `1px solid ${borderColor}`, background: "var(--color-bg-secondary)", padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}>
                          {show ? it.access_token : masked}
                        </code>
                        <button type="button" onClick={() => setRevealed((p) => ({ ...p, [it.id]: !p[it.id] }))}
                          style={{ fontSize: "0.75rem", color: mutedColor, background: "none", border: "none", cursor: "pointer" }}>
                          {show ? "Hide" : "Reveal"}
                        </button>
                        <button type="button" onClick={() => copy(it.id, it.access_token)}
                          style={{ fontSize: "0.75rem", color: mutedColor, background: "none", border: "none", cursor: "pointer" }}>
                          {copied === it.id ? "Copied" : "Copy"}
                        </button>
                      </div>
                    </div>
                    <button type="button" onClick={() => onRevoke(it)} disabled={pending}
                      style={{ fontSize: "0.75rem", color: "#ef4444", background: "none", border: "none", cursor: "pointer" }}>
                      Revoke
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
