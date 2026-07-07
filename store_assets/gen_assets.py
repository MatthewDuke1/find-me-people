"""Generate the Sula store-asset pages (standalone, exactly sized per Chrome
Web Store spec). Run from store_assets/: python gen_assets.py
Then render PNGs with render_assets.ps1 (headless Chrome)."""
import io

CSS = """
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Inter', -apple-system, 'Segoe UI', sans-serif;
    -webkit-font-smoothing: antialiased;
    color: #f8fafc; overflow: hidden; position: relative;
    background:
      radial-gradient(ellipse at 22% 18%, rgba(96,165,250,0.18) 0%, transparent 55%),
      radial-gradient(ellipse at 82% 82%, rgba(37,99,235,0.12) 0%, transparent 55%),
      #070d1a;
  }
  .title { font-weight: 900; letter-spacing: -0.5px; }
  .subtitle { color: #94a3b8; }
  .accent { color: #60a5fa; }
  .accent-line { position: absolute; bottom: 0; left: 0; right: 0; height: 4px;
    background: linear-gradient(90deg, #2563eb, #60a5fa, #93c5fd); }
  .card { background: #0c1322; border: 1px solid #1f2d47; border-radius: 10px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
  .badge-green { background: rgba(74,222,128,0.15); color: #4ade80; }
  .badge-yellow { background: rgba(251,191,36,0.15); color: #fbbf24; }
  .badge-gray { background: rgba(148,163,184,0.15); color: #94a3b8; }
  .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .logo { border-radius: 22%; }
  .brandline { display: flex; align-items: center; gap: 12px; }
"""


def page(w, h, body):
    return ("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"UTF-8\">\n"
            "<link href=\"https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap\" rel=\"stylesheet\">\n"
            "<style>\n  html, body { width: %dpx; height: %dpx; }\n%s</style>\n</head>\n<body>\n%s\n"
            "<div class=\"accent-line\"></div>\n</body>\n</html>\n" % (w, h, CSS, body))


def card(name, hint, badge, cls, border):
    return ('    <div class="card" style="padding:16px 20px;display:flex;align-items:center;justify-content:space-between;border-left:3px solid %s;">\n'
            '      <div><div style="font-size:16px;font-weight:700;">%s</div><div style="font-size:12px;color:#64748b;margin-top:2px;">%s</div></div>\n'
            '      <span class="badge %s">%s</span>\n    </div>' % (border, name, hint, cls, badge))


def link(t, u):
    return ('    <a class="card" style="padding:14px 20px;display:block;text-decoration:none;border-left:3px solid #60a5fa;">\n'
            '      <div style="font-size:15px;font-weight:600;color:#60a5fa;">%s</div>\n'
            '      <div style="font-size:12px;color:#64748b;margin-top:2px;">%s</div>\n    </a>' % (t, u))


shot1 = """<div style="width:1280px;height:800px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">
  <img class="logo" src="sula-icon.png" width="96" height="96" style="margin-bottom:24px;" />
  <div class="title" style="font-size:56px;line-height:1.08;max-width:820px;">Find people,<br><span class="accent">quickly.</span></div>
  <div class="subtitle" style="font-size:22px;margin-top:18px;max-width:640px;line-height:1.5;">Sula reads the page you're on and pulls out the emails and phone numbers, ranked by how likely they are to reach a person.</div>
  <div style="display:flex;gap:16px;margin-top:40px;">
    <div class="card" style="padding:14px 24px;display:flex;align-items:center;gap:12px;border-left:3px solid #60a5fa;">
      <span style="font-size:15px;font-weight:600;">support@company.com</span>
      <span class="badge badge-green">Likely support</span>
    </div>
    <div class="card" style="padding:14px 24px;display:flex;align-items:center;gap:12px;border-left:3px solid #60a5fa;">
      <span style="font-size:15px;font-weight:600;">1-800-555-0199</span>
      <span class="badge badge-green">Likely support</span>
    </div>
  </div>
  <div style="margin-top:16px;">
    <div class="card" style="padding:12px 24px;display:flex;align-items:center;gap:12px;border-left:3px solid #fbbf24;">
      <span style="font-size:14px;font-weight:500;color:#94a3b8;">info@company.com</span>
      <span class="badge badge-yellow">Possible</span>
    </div>
  </div>
</div>"""

shot2 = """<div style="width:1280px;height:800px;padding:40px;">
  <div style="text-align:center;margin-bottom:30px;">
    <div class="title" style="font-size:36px;">Scans every page on its own</div>
    <div class="subtitle" style="font-size:18px;margin-top:8px;">The badge counts what it found. Click to see the list.</div>
  </div>
  <div style="background:#0c1322;border:1px solid #1f2d47;border-radius:12px;overflow:hidden;max-width:1000px;margin:0 auto;">
    <div style="background:#101a2e;padding:12px 16px;display:flex;align-items:center;gap:8px;">
      <div class="dot" style="background:#f87171;"></div>
      <div class="dot" style="background:#fbbf24;"></div>
      <div class="dot" style="background:#4ade80;"></div>
      <div style="background:#1f2d47;border-radius:6px;padding:6px 16px;margin-left:16px;flex:1;max-width:400px;">
        <span style="font-size:12px;color:#64748b;">example-company.com</span>
      </div>
      <div style="position:relative;margin-left:auto;">
        <img class="logo" src="sula-icon.png" width="28" height="28" />
        <div style="position:absolute;top:-4px;right:-4px;background:#60a5fa;color:#071022;font-size:9px;font-weight:800;padding:1px 4px;border-radius:8px;">4</div>
      </div>
    </div>
    <div style="display:flex;min-height:430px;">
      <div style="flex:1;padding:30px;">
        <div style="width:60%;height:12px;background:#101a2e;border-radius:4px;margin-bottom:12px;"></div>
        <div style="width:80%;height:12px;background:#101a2e;border-radius:4px;margin-bottom:12px;"></div>
        <div style="width:45%;height:12px;background:#101a2e;border-radius:4px;margin-bottom:24px;"></div>
        <div style="width:70%;height:12px;background:#101a2e;border-radius:4px;margin-bottom:12px;"></div>
        <div style="width:55%;height:12px;background:#101a2e;border-radius:4px;"></div>
      </div>
      <div style="width:300px;background:#070d1a;border-left:1px solid #1f2d47;">
        <div style="background:#0c1322;border-bottom:1px solid #1f2d47;padding:12px 14px;display:flex;align-items:center;gap:8px;">
          <img class="logo" src="sula-icon.png" width="18" height="18" />
          <span style="font-weight:700;font-size:13px;">Sula</span>
        </div>
        <div style="padding:8px 12px;display:flex;align-items:center;gap:6px;font-size:11px;color:#94a3b8;">
          <div class="dot" style="background:#4ade80;width:7px;height:7px;"></div> Found 4 contacts on this page
        </div>
        <div style="padding:4px 12px;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Email</div>
        <div style="margin:4px 12px;padding:10px;background:#0c1322;border:1px solid #1f2d47;border-radius:6px;border-left:3px solid #60a5fa;">
          <div style="font-size:13px;font-weight:600;">support@example.com</div>
          <div style="font-size:10px;color:#64748b;margin-top:3px;display:flex;justify-content:space-between;"><span>Click to copy</span><span class="badge badge-green" style="font-size:9px;">Likely support</span></div>
        </div>
        <div style="margin:4px 12px;padding:10px;background:#0c1322;border:1px solid #1f2d47;border-radius:6px;border-left:3px solid #60a5fa;">
          <div style="font-size:13px;font-weight:600;">help@example.com</div>
          <div style="font-size:10px;color:#64748b;margin-top:3px;display:flex;justify-content:space-between;"><span>Click to copy</span><span class="badge badge-green" style="font-size:9px;">Likely support</span></div>
        </div>
        <div style="padding:4px 12px;margin-top:8px;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Phone</div>
        <div style="margin:4px 12px;padding:10px;background:#0c1322;border:1px solid #1f2d47;border-radius:6px;border-left:3px solid #60a5fa;">
          <div style="font-size:13px;font-weight:600;">1-800-555-0199</div>
          <div style="font-size:10px;color:#64748b;margin-top:3px;">Click to copy</div>
        </div>
      </div>
    </div>
  </div>
</div>"""

shot3 = ("""<div style="width:1280px;height:800px;display:flex;flex-direction:column;align-items:center;justify-content:center;">
  <div class="title" style="font-size:40px;margin-bottom:8px;">Ranked, so you don't guess</div>
  <div class="subtitle" style="font-size:18px;margin-bottom:40px;">The best contact floats to the top. Dead ends sink.</div>
  <div style="display:flex;flex-direction:column;gap:12px;width:520px;">
""" + card("support@acme.com", "Found in a mailto: link in the footer", "Likely support", "badge-green", "#60a5fa") + "\n"
    + card("1-888-ACME-HELP", "Found next to &quot;Customer Service&quot;", "Likely support", "badge-green", "#60a5fa") + "\n"
    + card("info@acme.com", "General inbox, may route to support", "Possible", "badge-yellow", "#fbbf24") + "\n"
    + card("careers@acme.com", "Not customer service", "Low match", "badge-gray", "#64748b") + """
  </div>
</div>""")

shot4 = """<div style="width:1280px;height:800px;display:flex;flex-direction:column;align-items:center;justify-content:center;">
  <div class="title" style="font-size:40px;margin-bottom:8px;">One click to copy</div>
  <div class="subtitle" style="font-size:18px;margin-bottom:48px;">Click any result. It's on your clipboard.</div>
  <div style="position:relative;width:520px;">
    <div class="card" style="padding:16px 20px;border:1px solid #60a5fa;border-left:3px solid #60a5fa;display:flex;align-items:center;justify-content:space-between;">
      <div><div style="font-size:16px;font-weight:700;">support@bigstore.com</div><div style="font-size:12px;color:#60a5fa;margin-top:2px;">Copied</div></div>
      <span class="badge" style="background:rgba(96,165,250,0.2);color:#60a5fa;">&#10003; Copied</span>
    </div>
    <div style="position:absolute;top:-54px;left:50%;transform:translateX(-50%);background:#60a5fa;color:#071022;padding:8px 24px;border-radius:10px;font-size:14px;font-weight:700;white-space:nowrap;">
      Copied to clipboard
    </div>
  </div>
  <div style="margin-top:24px;color:#64748b;font-size:14px;">Paste it into your email, dialer, or CRM.</div>
</div>"""

shot5 = ("""<div style="width:1280px;height:800px;display:flex;flex-direction:column;align-items:center;justify-content:center;">
  <div class="title" style="font-size:40px;margin-bottom:8px;">Finds the hidden support pages</div>
  <div class="subtitle" style="font-size:18px;margin-bottom:40px;">Even when the page shows no email or phone at all</div>
  <div style="display:flex;flex-direction:column;gap:12px;width:520px;">
    <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Support pages detected</div>
""" + link("Contact Us", "/contact-us") + "\n" + link("Help Center", "/help") + "\n"
    + link("Get Support", "/support/get-in-touch") + """
  </div>
  <div style="margin-top:24px;display:flex;align-items:center;gap:8px;">
    <div class="dot" style="background:#fbbf24;width:8px;height:8px;"></div>
    <span style="font-size:13px;color:#94a3b8;">Click any link to go straight there</span>
  </div>
</div>""")

small = """<div style="width:440px;height:280px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">
  <img class="logo" src="sula-icon.png" width="72" height="72" style="margin-bottom:14px;" />
  <div class="title" style="font-size:30px;">Sula</div>
  <div style="font-size:14px;color:#60a5fa;font-weight:600;margin-top:6px;">Find people, quickly.</div>
  <div style="margin-top:14px;">
    <span style="font-size:11px;color:#94a3b8;">Emails and phone numbers on any page. One click.</span>
  </div>
</div>"""

marquee = ("""<div style="width:1400px;height:560px;display:flex;align-items:center;padding:0 90px;">
  <div style="flex:1;max-width:640px;">
    <div class="brandline" style="margin-bottom:20px;">
      <img class="logo" src="sula-icon.png" width="56" height="56" />
      <span style="font-size:15px;font-weight:800;letter-spacing:4px;text-transform:uppercase;color:#60a5fa;">Sula</span>
    </div>
    <div class="title" style="font-size:64px;line-height:1.05;">Find people,<br><span class="accent">quickly.</span></div>
    <div class="subtitle" style="font-size:20px;margin-top:18px;max-width:520px;line-height:1.5;">The emails and phone numbers already on the page, ranked and one click away. No account. Nothing leaves your browser.</div>
    <div style="display:flex;gap:18px;margin-top:26px;">
      <div style="display:flex;align-items:center;gap:6px;"><div class="dot" style="background:#60a5fa;"></div><span style="font-size:13px;color:#94a3b8;">Scans on its own</span></div>
      <div style="display:flex;align-items:center;gap:6px;"><div class="dot" style="background:#4ade80;"></div><span style="font-size:13px;color:#94a3b8;">Ranked results</span></div>
      <div style="display:flex;align-items:center;gap:6px;"><div class="dot" style="background:#fbbf24;"></div><span style="font-size:13px;color:#94a3b8;">Click to copy</span></div>
    </div>
  </div>
  <div style="display:flex;flex-direction:column;gap:14px;width:440px;margin-left:auto;">
""" + card("support@company.com", "Click to copy", "Likely support", "badge-green", "#60a5fa") + "\n"
    + card("1-800-555-HELP", "Click to copy", "Likely support", "badge-green", "#60a5fa") + "\n"
    + card("info@company.com", "Click to copy", "Possible", "badge-yellow", "#fbbf24") + """
  </div>
</div>""")

# The marquee design reflowed to the standard social-card size (og:image,
# LinkedIn, Twitter). 1200x630 is 1.9:1 vs the marquee's 2.5:1, so the text
# column gets more height and the card column narrows.
social = ("""<div style="width:1200px;height:630px;display:flex;align-items:center;padding:0 70px;">
  <div style="flex:1;max-width:560px;">
    <div class="brandline" style="margin-bottom:22px;">
      <img class="logo" src="sula-icon.png" width="56" height="56" />
      <span style="font-size:15px;font-weight:800;letter-spacing:4px;text-transform:uppercase;color:#60a5fa;">Sula</span>
    </div>
    <div class="title" style="font-size:58px;line-height:1.06;">Find people,<br><span class="accent">quickly.</span></div>
    <div class="subtitle" style="font-size:19px;margin-top:18px;max-width:470px;line-height:1.5;">The emails and phone numbers already on the page, ranked and one click away. No account. Nothing leaves your browser.</div>
    <div style="display:flex;gap:16px;margin-top:26px;">
      <div style="display:flex;align-items:center;gap:6px;"><div class="dot" style="background:#60a5fa;"></div><span style="font-size:13px;color:#94a3b8;">Scans on its own</span></div>
      <div style="display:flex;align-items:center;gap:6px;"><div class="dot" style="background:#4ade80;"></div><span style="font-size:13px;color:#94a3b8;">Ranked results</span></div>
      <div style="display:flex;align-items:center;gap:6px;"><div class="dot" style="background:#fbbf24;"></div><span style="font-size:13px;color:#94a3b8;">Click to copy</span></div>
    </div>
  </div>
  <div style="display:flex;flex-direction:column;gap:14px;width:390px;margin-left:auto;">
""" + card("support@company.com", "Click to copy", "Likely support", "badge-green", "#60a5fa") + "\n"
    + card("1-800-555-HELP", "Click to copy", "Likely support", "badge-green", "#60a5fa") + "\n"
    + card("info@company.com", "Click to copy", "Possible", "badge-yellow", "#fbbf24") + """
  </div>
</div>""")

files = {
    'shot1_hero.html': (1280, 800, shot1),
    'shot2_autoscan.html': (1280, 800, shot2),
    'shot3_ranking.html': (1280, 800, shot3),
    'shot4_copy.html': (1280, 800, shot4),
    'shot5_support_pages.html': (1280, 800, shot5),
    'small_promo.html': (440, 280, small),
    'marquee_promo.html': (1400, 560, marquee),
    'social_card.html': (1200, 630, social),
}
for name, (w, h, body) in files.items():
    io.open(name, 'w', encoding='utf-8').write(page(w, h, body))
    print("wrote", name)

index = """<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Sula store assets</title>
<style>body{font-family:sans-serif;background:#070d1a;color:#f8fafc;padding:30px}
a{color:#60a5fa;display:block;margin:6px 0}</style></head><body>
<h1>Sula store assets</h1>
<p>Each asset is a standalone HTML page sized to its exact store dimension.
Regenerate the pages with <code>python gen_assets.py</code>, then render PNGs
with <code>powershell -File render_assets.ps1</code> (headless Chrome).</p>
<a href="shot1_hero.html">Screenshot 1 - hero (1280x800)</a>
<a href="shot2_autoscan.html">Screenshot 2 - auto-scan (1280x800)</a>
<a href="shot3_ranking.html">Screenshot 3 - ranking (1280x800)</a>
<a href="shot4_copy.html">Screenshot 4 - copy (1280x800)</a>
<a href="shot5_support_pages.html">Screenshot 5 - support pages (1280x800)</a>
<a href="small_promo.html">Small promo (440x280)</a>
<a href="marquee_promo.html">Marquee promo (1400x560)</a>
<p>Store icon: store_icon_128x128.png (copied from icons/icon128.png).</p>
</body></html>
"""
io.open('screenshots.html', 'w', encoding='utf-8').write(index)
print("wrote screenshots.html (index)")
