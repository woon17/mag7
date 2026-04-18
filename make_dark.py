"""
make_dark.py
------------
Converts layoffs_interactive.html (white, Plotly-generated) into
layoffs_interactive_dark.html (dark theme, with Back-to-Dashboard header).

Run from the mag7/ directory:
    python make_dark.py

Re-run whenever layoffs_interactive.html is updated by a teammate.
"""

import re, sys
from pathlib import Path

SRC  = Path("layoffs_interactive.html")
DEST = Path("layoffs_interactive_dark.html")

# ── Sanity check ──────────────────────────────────────────────────────────────
if not SRC.exists():
    sys.exit(f"ERROR: {SRC} not found. Run from the mag7/ directory.")

content = SRC.read_text(encoding="utf-8")

# ── 1. Replace bare HTML shell with dark page shell ───────────────────────────
# Match everything from <html> up to (and including) the first <script> tag
# that loads Plotly (with or without integrity attribute).
shell_pattern = re.compile(
    r"<html[^>]*>.*?<script[^>]*plotly[^>]*></script>",
    re.DOTALL | re.IGNORECASE,
)
dark_shell = """\
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mag 7 — CapEx &amp; Layoffs (Dark)</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #161b22; color: #c9d1d9; font-family: Arial, sans-serif; }
    .page-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 20px; background: #0d1117; border-bottom: 1px solid #30363d;
    }
    .page-header h1 { font-size: 1.1rem; color: #e6edf3; }
    .back-btn {
      color: #58a6ff; text-decoration: none; font-size: 0.85rem;
      border: 1px solid #30363d; padding: 4px 10px; border-radius: 4px;
    }
    .back-btn:hover { background: #21262d; }
    .chart-wrap { display: flex; justify-content: center; padding: 16px; overflow: auto; }
  </style>
</head>
<body>
  <div class="page-header">
    <h1>Mag 7 — CapEx &amp; Tech Layoffs Dashboard</h1>
    <a href="index.html" class="back-btn">← Back to Dashboard</a>
  </div>
  <div class="chart-wrap">
    <div>
      <script>window.PlotlyConfig = {MathJaxConfig: 'local'};</script>
      <script charset="utf-8" src="https://cdn.plot.ly/plotly-3.4.0.min.js"></script>"""

if not shell_pattern.search(content):
    sys.exit("ERROR: Could not find Plotly script tag in source file. "
             "Check that layoffs_interactive.html is a valid Plotly export.")

content = shell_pattern.sub(dark_shell, content, count=1)

# ── 2. Replace closing tags ───────────────────────────────────────────────────
content = re.sub(
    r"</body>\s*</html>\s*$",
    "    </div>\n  </div>\n</body>\n</html>\n",
    content,
    flags=re.DOTALL,
)

# ── 3. AAPL colour: near-white → visible slate-blue ──────────────────────────
# Affects both the quarterly line trace and the annual bar trace
content = content.replace('"color":"#f0f0f0"', '"color":"#b0b8c8"')

# ── 4. Monthly Total dashed line: black → light grey ─────────────────────────
content = content.replace(
    '"color":"rgba(0,0,0,0.30)"',
    '"color":"rgba(200,200,200,0.55)"',
)

# ── 5. Chart backgrounds ──────────────────────────────────────────────────────
content = content.replace(
    '"plot_bgcolor":"white","paper_bgcolor":"white"',
    '"plot_bgcolor":"#161b22","paper_bgcolor":"#161b22"',
)

# ── 6. Global font colour (overrides Plotly template's dark-blue default) ─────
content = content.replace(
    '"height":1050,"width":1400}',
    '"font":{"color":"#c9d1d9"},"height":1050,"width":1400}',
)

# ── 7. Legend backgrounds ─────────────────────────────────────────────────────
content = content.replace(
    '"bgcolor":"rgba(255,255,255,0.85)","bordercolor":"rgba(200,200,200,0.6)","borderwidth":1}',
    '"bgcolor":"rgba(22,27,34,0.9)","bordercolor":"rgba(48,54,61,0.8)","borderwidth":1}',
)

# ── 8. Subplot title annotation font colours ──────────────────────────────────
content = content.replace(
    '{"font":{"size":16},"showarrow":false',
    '{"font":{"size":16,"color":"#c9d1d9"},"showarrow":false',
)

# ── 9. Axis zero-lines and border lines: white → nearly invisible ─────────────
DARK_AXIS = (
    ',"zerolinecolor":"rgba(80,100,120,0.2)"'
    ',"zerolinewidth":1'
    ',"linecolor":"rgba(80,100,120,0.2)"'
)
# Each axis ends with its closing brace; insert extra props before it.
# We target each named axis block by its unique anchor+domain signature.
axis_patterns = [
    # xaxis  (quarterly CapEx x)
    (r'("xaxis":\{"anchor":"y","domain":\[0\.0,0\.465[^}]+\})',
     DARK_AXIS),
    # yaxis
    (r'("yaxis":\{"anchor":"x","domain":\[0\.622[^}]+\})',
     DARK_AXIS),
    # xaxis2
    (r'("xaxis2":\{"anchor":"y2","domain":\[0\.534[^}]+\})',
     DARK_AXIS),
    # yaxis2
    (r'("yaxis2":\{"anchor":"x2","domain":\[0\.622[^}]+\})',
     DARK_AXIS),
    # xaxis3
    (r'("xaxis3":\{"anchor":"y3","domain":\[0\.0,0\.999[^}]+\})',
     DARK_AXIS),
    # yaxis3
    (r'("yaxis3":\{"anchor":"x3","domain":\[0\.0,0\.522[^}]+\})',
     DARK_AXIS),
]
for pattern, extra in axis_patterns:
    content = re.sub(pattern, lambda m, e=extra: m.group(0)[:-1] + e + "}", content)

# ── Write output ──────────────────────────────────────────────────────────────
DEST.write_text(content, encoding="utf-8")

# ── Verify key changes ────────────────────────────────────────────────────────
checks = [
    ("#161b22",                    "dark background"),
    ("page-header",                "page shell"),
    ("Back to Dashboard",          "back link"),
    ('"color":"rgba(200,200,200,0.55)"', "Monthly Total colour"),
    ('"color":"#b0b8c8"',          "AAPL colour"),
    ('"color":"#c9d1d9"',          "font colour"),
    ("rgba(22,27,34,0.9)",         "legend bg"),
    ("rgba(80,100,120,0.2)",       "axis lines muted"),
]
all_ok = True
for needle, label in checks:
    ok = needle in content
    print(f"  {'✅' if ok else '❌'} {label}")
    if not ok:
        all_ok = False

if all_ok:
    print(f"\n✅  Written: {DEST}  ({DEST.stat().st_size // 1024} KB)")
else:
    print("\n⚠️  Some checks failed — review the output file.")
