"""Renders report.json into ONE self-contained, print-ready HTML file.

No CDN, no external fonts, no build step: inline CSS and ~30 lines of vanilla
JS. Everything that came from the target is HTML-escaped.
"""
from datetime import datetime

from reporting.builder import sort_findings

_CSS = """
:root{
  --ink:#16181d; --muted:#575c66; --line:#e2e5ea; --bg:#f6f7f9; --card:#ffffff;
  --accent:#0f3d5c; --radius:10px;
  --font:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,"Courier New",monospace;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font);
  font-size:16px;line-height:1.55}
.page{max-width:960px;margin:0 auto;padding:28px 20px 56px}
h1,h2,h3,h4{line-height:1.25;margin:0 0 .5em}
h1{font-size:1.9rem;letter-spacing:-.02em}
h2{font-size:1.3rem;margin-top:0}
h3{font-size:1.05rem}
p{margin:0 0 .8em}
a{color:var(--accent)}
.muted{color:var(--muted);font-size:.9rem}
section{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);
  padding:24px;margin:0 0 20px}
.cover{background:linear-gradient(160deg,#0f3d5c,#12324a 60%,#0b2436);color:#fff;
  border-radius:var(--radius);padding:32px;margin-bottom:20px;border:0}
.cover .brand{font-weight:700;letter-spacing:.18em;text-transform:uppercase;
  font-size:.78rem;color:#9fc6dd;margin-bottom:14px}
.cover h1{color:#fff;margin-bottom:6px}
.cover .target{font-family:var(--mono);font-size:1rem;color:#d8e6ef;word-break:break-all;
  margin-bottom:14px}
.cover .meta{color:#b9d1e0;font-size:.9rem}
.badge{display:inline-flex;align-items:center;gap:10px;margin-top:20px;padding:10px 18px;
  border-radius:999px;background:var(--c);color:#fff;font-weight:700;font-size:1.05rem}
.badge .icon{font-size:1.15rem}
.facts{list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:10px}
.facts li{background:#eef1f5;border-radius:8px;padding:8px 12px;font-size:.9rem}
.facts strong{font-variant-numeric:tabular-nums}
.scale{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:6px 0 18px}
.seg{position:relative;border-radius:8px;overflow:hidden;background:#eef1f5;
  padding:16px 10px 10px;text-align:center;border:1px solid var(--line)}
.seg .bar{position:absolute;inset:0 0 auto 0;height:8px;background:var(--c)}
.seg .n{display:block;font-size:1.35rem;font-weight:700;font-variant-numeric:tabular-nums}
.seg .l{display:block;font-size:.78rem;color:var(--muted);text-transform:uppercase;
  letter-spacing:.06em}
.seg .marker{position:absolute;top:10px;right:8px;background:var(--ink);color:#fff;
  font-size:.62rem;letter-spacing:.06em;text-transform:uppercase;padding:2px 6px;
  border-radius:999px}
.seg.on{box-shadow:0 0 0 2px var(--c) inset}
.legend{list-style:none;padding:0;margin:0;display:grid;gap:10px}
.legend li{display:grid;grid-template-columns:16px 1fr;gap:10px;align-items:start;
  font-size:.92rem}
.dot{width:12px;height:12px;border-radius:50%;background:var(--c);margin-top:5px}
.legend .fix{color:var(--muted)}
.controls{display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:center}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chip{border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:999px;
  padding:6px 14px;font:inherit;font-size:.86rem;cursor:pointer}
.chip[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:#fff}
.chip:focus-visible,.toggle input:focus-visible{outline:3px solid #1d4ed8;outline-offset:2px}
.toggle{display:flex;align-items:center;gap:8px;font-size:.88rem;color:var(--muted)}
.toggle input{width:18px;height:18px;accent-color:var(--accent)}
.card{border:1px solid var(--line);border-radius:var(--radius);margin-bottom:12px;
  background:#fff;border-left:5px solid var(--c);overflow:hidden}
.card summary{cursor:pointer;padding:14px 16px;display:grid;
  grid-template-columns:auto 1fr;gap:4px 12px;align-items:center;list-style:none}
.card summary::-webkit-details-marker{display:none}
.card summary:focus-visible{outline:3px solid #1d4ed8;outline-offset:-3px}
.card .sev{display:inline-flex;align-items:center;gap:6px;font-size:.74rem;font-weight:700;
  text-transform:uppercase;letter-spacing:.07em;color:#fff;background:var(--c);
  padding:3px 10px;border-radius:999px;white-space:nowrap}
.card .title{font-weight:600}
.card .meta{grid-column:2;color:var(--muted);font-size:.82rem;font-family:var(--mono);
  word-break:break-all}
.card .auto{grid-column:2;font-size:.72rem;color:#8a5300;background:#fff4d6;
  border:1px solid #f0d69a;border-radius:999px;padding:1px 8px;justify-self:start}
.card .body{padding:4px 16px 16px;border-top:1px solid var(--line)}
.card h4{font-size:.76rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);
  margin:16px 0 4px}
.mitigation{background:#f0f7f4;border:1px solid #cfe6db;border-radius:8px;padding:12px 14px;
  margin-top:8px}
.mitigation h4{margin-top:0;color:#14532d}
pre{background:#0f1419;color:#e6edf3;padding:12px 14px;border-radius:8px;overflow-x:auto;
  font-family:var(--mono);font-size:.8rem;white-space:pre-wrap;word-break:break-word;
  margin:0;max-height:280px}
.tech-only{display:none}
body.tech .tech-only{display:block}
table{width:100%;border-collapse:collapse;font-size:.88rem}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:.74rem;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)}
td.num{font-variant-numeric:tabular-nums}
.pill{display:inline-block;border-radius:999px;padding:1px 9px;font-size:.75rem;
  font-weight:600;background:#eef1f5;color:#33383f}
.pill.ok{background:#dcfce7;color:#14532d}
.pill.bad{background:#fde2e1;color:#7f1d1d}
.pill.warn{background:#fdf0d5;color:#7c4a03}
.empty{color:var(--muted);font-style:italic}
footer{color:var(--muted);font-size:.82rem;text-align:center;padding:8px 0 0}
@media (max-width:640px){
  .scale{grid-template-columns:repeat(2,1fr)}
  .cover{padding:22px}
}
@media print{
  @page{size:A4;margin:14mm}
  body{background:#fff;font-size:10.5pt}
  .page{max-width:none;padding:0}
  .controls,.chip,.toggle,footer .noprint{display:none!important}
  section,.cover{border:1px solid #ccc;box-shadow:none;page-break-inside:avoid}
  .cover{background:#fff;color:#111;border:2px solid #111}
  .cover .brand,.cover .target,.cover .meta{color:#333}
  .cover h1{color:#111}
  .badge{border:2px solid var(--c);color:#111;background:#fff}
  .card,details{page-break-inside:avoid;break-inside:avoid}
  details>.body{display:block!important}
  pre{background:#f4f4f4;color:#111;border:1px solid #ccc;max-height:none}
  a{color:inherit;text-decoration:none}
}
"""

_JS = """
(function(){
  var cards = Array.prototype.slice.call(document.querySelectorAll('.card'));
  var chips = Array.prototype.slice.call(document.querySelectorAll('.chip'));
  var toggle = document.getElementById('tech');
  var shown = document.getElementById('shown');
  var sev = 'all';
  function render(){
    var n = 0;
    cards.forEach(function(card){
      var match = sev === 'all' || card.getAttribute('data-sev') === sev;
      card.hidden = !match;
      if (match) { n += 1; }
    });
    chips.forEach(function(c){ c.setAttribute('aria-pressed', String(c.getAttribute('data-sev') === sev)); });
    if (shown) { shown.textContent = 'Showing ' + n + ' of ' + cards.length + ' findings'; }
  }
  chips.forEach(function(c){ c.addEventListener('click', function(){ sev = c.getAttribute('data-sev'); render(); }); });
  if (toggle) { toggle.addEventListener('change', function(){ document.body.classList.toggle('tech', toggle.checked); }); }
  window.addEventListener('beforeprint', function(){ cards.forEach(function(c){ c.open = true; }); });
  render();
})();
"""

_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def esc(value) -> str:
    s = "" if value is None else str(value)
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;").replace("'", "&#x27;"))


def _duration(seconds) -> str:
    seconds = int(seconds or 0)
    if seconds < 60:
        return f"{seconds}s"
    minutes, secs = divmod(seconds, 60)
    if minutes < 60:
        return f"{minutes}m {secs}s"
    hours, minutes = divmod(minutes, 60)
    return f"{hours}h {minutes}m"


def _nice_date(iso_text: str) -> str:
    try:
        dt = datetime.strptime(str(iso_text), "%Y-%m-%dT%H:%M:%SZ")
    except (ValueError, TypeError):
        return str(iso_text or "")
    return f"{dt.day} {_MONTHS[dt.month - 1]} {dt.year}, {dt:%H:%M} UTC"


def _status_pill(status: str) -> str:
    low = (status or "").lower()
    css = "ok" if low == "ok" else ("bad" if low in ("error", "crash") else "warn")
    return f'<span class="pill {css}">{esc(status or "unknown")}</span>'


def _scale_section(report: dict) -> str:
    counts = report.get("counts") or {}
    overall_key = report.get("overall", {}).get("key")
    segments = []
    for level in report.get("severity_scale") or []:
        on = " on" if level["key"] == overall_key else ""
        marker = '<span class="marker">Overall</span>' if on else ""
        segments.append(
            f'<div class="seg{on}" style="--c:{esc(level["colour"])}">'
            f'<span class="bar"></span>{marker}'
            f'<span class="n">{esc(counts.get(level["key"], 0))}</span>'
            f'<span class="l">{esc(level["label"])}</span></div>'
        )
    legend = "".join(
        f'<li style="--c:{esc(level["colour"])}"><span class="dot"></span>'
        f'<span><strong>{esc(level["label"])}</strong> &mdash; {esc(level["meaning"])} '
        f'<span class="fix">({esc(level["fix"])})</span></span></li>'
        for level in report.get("severity_scale") or []
    )
    return (
        '<section id="scale"><h2>Severity scale</h2>'
        '<div class="scale">' + "".join(segments) + "</div>"
        '<ul class="legend">' + legend + "</ul></section>"
    )


def _finding_card(finding: dict, scale: dict) -> str:
    level = scale.get(finding.get("severity_key"), scale["informational"])
    colour = level["colour"]
    icon = esc(level["icon"])

    auto = ""
    if finding.get("text_source") == "fallback":
        auto = '<span class="auto">auto-text</span>'

    technical = ""
    if finding.get("technical_note") or finding.get("evidence"):
        technical = (
            '<div class="tech-only">'
            + (f'<h4>Technical note</h4><p>{esc(finding["technical_note"])}</p>'
               if finding.get("technical_note") else "")
            + (f'<h4>Evidence</h4><pre>{esc(finding["evidence"])}</pre>'
               if finding.get("evidence") else "")
            + "</div>"
        )

    mitigation = (
        '<div class="mitigation"><h4>What to do</h4><p>'
        + esc(finding.get("mitigation") or "Review this finding and apply the vendor recommendation.")
        + "</p></div>"
    )

    return (
        f'<details class="card" data-sev="{esc(finding.get("severity_key"))}" '
        f'style="--c:{esc(colour)}">'
        f'<summary><span class="sev"><span aria-hidden="true">{icon}</span>'
        f'{esc(finding.get("severity"))}</span>'
        f'<span class="title">{esc(finding.get("name"))}</span>'
        f'<span class="meta">{esc(finding.get("tool"))} &middot; {esc(finding.get("url"))}</span>'
        f"{auto}</summary>"
        f'<div class="body"><p>{esc(finding.get("summary"))}</p>{mitigation}{technical}</div>'
        f"</details>"
    )


def render_html(report: dict) -> str:
    overall = report.get("overall") or {}
    findings = sort_findings(report.get("findings") or [])
    counts = report.get("counts") or {}
    tools = report.get("tools") or []
    ran = sum(1 for t in tools if t.get("status") == "ok")
    scale = {level["key"]: level for level in (report.get("severity_scale") or [])}
    if "informational" not in scale:
        from reporting.schema import SEVERITY_BY_KEY
        scale = dict(SEVERITY_BY_KEY)

    cards = "".join(_finding_card(f, scale) for f in findings) or (
        '<p class="empty">No findings were produced. Check the tool coverage section below.</p>'
    )

    chips = ['<button class="chip" type="button" data-sev="all" aria-pressed="true">All '
             f'<span aria-hidden="true">({esc(counts.get("total", 0))})</span></button>']
    for level in report.get("severity_scale") or []:
        chips.append(
            f'<button class="chip" type="button" data-sev="{esc(level["key"])}" aria-pressed="false">'
            f'{esc(level["label"])} ({esc(counts.get(level["key"], 0))})</button>'
        )

    tool_rows = "".join(
        f'<tr><td><strong>{esc(t.get("name"))}</strong></td><td>{_status_pill(t.get("status"))}</td>'
        f'<td class="num">{esc(t.get("count", 0))}</td><td>{esc(t.get("detail")) or "&mdash;"}</td></tr>'
        for t in tools
    ) or '<tr><td colspan="4" class="empty">No tool status recorded.</td></tr>'

    summary = report.get("executive_summary") or "No summary was generated for this scan."
    badge_style = f'--c:{esc(overall.get("colour", "#15803d"))}'
    badge_icon = overall.get("icon", "\u2713")

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PenflowAI report &mdash; {esc(report.get("target"))}</title>
<style>{_CSS}</style>
</head>
<body>
<div class="page">
  <header class="cover">
    <div class="brand">PenflowAI</div>
    <h1>Security Assessment Report</h1>
    <p class="target">{esc(report.get("target"))}</p>
    <p class="meta">{esc(_nice_date(report.get("generated_at")))} &middot;
      Duration {esc(_duration(report.get("duration_seconds")))} &middot;
      Run {esc(report.get("run_id"))}</p>
    <div class="badge" style="{badge_style}">
      <span class="icon" aria-hidden="true">{esc(badge_icon)}</span>
      <span>{esc(overall.get("label", "No findings"))}</span>
    </div>
  </header>

  <section id="summary">
    <h2>Executive summary</h2>
    <p>{esc(summary)}</p>
    <ul class="facts">
      <li>Total findings <strong>{esc(counts.get("total", 0))}</strong></li>
      <li>Critical <strong>{esc(counts.get("critical", 0))}</strong></li>
      <li>High <strong>{esc(counts.get("high", 0))}</strong></li>
      <li>Tools that ran <strong>{esc(ran)} of {esc(len(tools))}</strong></li>
    </ul>
  </section>

  {_scale_section(report)}

  <section class="controls" id="controls">
    <div class="chips" role="group" aria-label="Filter findings by severity">{''.join(chips)}</div>
    <label class="toggle"><input type="checkbox" id="tech"> Show technical detail</label>
  </section>

  <section id="findings">
    <h2>Findings</h2>
    <p class="muted" id="shown" aria-live="polite">Showing {esc(len(findings))} of {esc(len(findings))} findings</p>
    {cards}
  </section>

  <section id="coverage">
    <h2>Tool coverage</h2>
    <p>{esc(report.get("coverage_note"))}</p>
    <table>
      <thead><tr><th scope="col">Tool</th><th scope="col">Status</th>
        <th scope="col">Findings</th><th scope="col">Detail</th></tr></thead>
      <tbody>{tool_rows}</tbody>
    </table>
  </section>

  <footer>
    <p>AI-assisted text, verify before acting. Generated by PenflowAI
      (schema {esc(report.get("schema_version"))}).
      {"" if report.get("ai", {}).get("used") else "AI text was not used for this report."}</p>
  </footer>
</div>
<script>{_JS}</script>
</body>
</html>
"""
