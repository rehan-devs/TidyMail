# Tidy Mail

Email cleaning, fixing, and verification tool. Built as a self-contained web app that takes a messy CSV or Excel file full of email addresses and gives you back a categorized Excel report telling you which emails are usable, which are junk, which need review, and which belong to Google Workspace versus other providers.

Built with pure Node.js on the backend (no Express, no frameworks, just the built-in http module) and vanilla HTML, CSS, and JavaScript on the frontend. The only external dependency is the xlsx package for Excel file generation.

---

## What It Does

You upload a spreadsheet full of email addresses. Tidy Mail processes them through eight stages:

1. **Parse** — extracts all email-like patterns from any cell in the file
2. **Clean** — removes junk characters, URL encoding artifacts, filter words, blocked TLDs
3. **Fix** — corrects common TLD typos like .con to .com, .comm to .com, using both a lookup map and Levenshtein distance
4. **Validate** — checks each email against RFC 5322 format rules
5. **Deduplicate** — removes case-insensitive duplicates, keeps the cleanest version
6. **DNS Check** — verifies the domain actually exists in DNS
7. **MX Check** — pulls MX records to identify the email provider and detect catch-all signals
8. **Categorize** — assigns each email a primary category and tags

At the end you get an Excel file with 17 sheets covering every angle: Google Workspace emails, Non-Google emails, trade-based emails (construction, plumbing, electrical keywords), role-based emails (info@, admin@, sales@), removed emails with reasons, disposable domains, emails needing manual review, and a full audit log.

---

## Why It Exists

Most email cleaning tools either cost a fortune per verification, send your data to third-party APIs, or give you a single "valid/invalid" flag with no context. Tidy Mail runs entirely on your own machine, uses only DNS lookups (which are free and unlimited), and gives you rich categorization so you can make intelligent decisions about which emails to actually use.

The trade-based and role-based tagging is specifically built for outreach workflows where you want to filter out generic addresses like info@ or target specific industries like construction contractors.

---

## Tech Stack

- **Backend:** Pure Node.js using only built-in modules (http, fs, dns, path, crypto, url)
- **Frontend:** Vanilla HTML, CSS, JavaScript. No React, no Vue, no build step
- **External dependency:** xlsx (for Excel file generation only)
- **Storage:** JSON files on disk, no database. Job folders auto-delete after 24 hours
- **DNS:** Uses Cloudflare (1.1.1.1) and Google (8.8.8.8) public DNS servers for fast lookups

---

## Features

- Drag-and-drop file upload with support for CSV, XLS, XLSX
- Real-time progress with live counters that update as domains resolve
- Concurrent DNS lookups (70 simultaneous by default) with domain result caching
- Full RFC 5322 email format validation
- Levenshtein distance algorithm for TLD typo correction (built from scratch)
- Google Workspace detection via MX record analysis
- Catch-all detection using DNS heuristics (SPF, DKIM, shared hosting patterns)
- Trade-based email tagging (electrical, plumbing, construction, HVAC, etc.)
- Role-based email tagging (info@, admin@, support@, etc.)
- Cross-cutting categorization (an email can be Google Workspace AND trade-based simultaneously)
- 17-sheet Excel export with autofilters and frozen headers
- Automatic cleanup of job files after 24 hours
- Fully responsive UI that works on mobile

---

## Requirements

- Node.js version 18 or higher
- About 100 MB of free disk space
- An internet connection (for DNS lookups)

---

## Installation

Clone or download this repository to your computer.

Open a terminal in the project folder and run:
npm install


This will install the single dependency (xlsx).

---

## Running It

Start the server:
npm start


You should see output like this:
[CLEANER] Loaded 114 filter words
[CLEANER] Loaded 45 blocked TLDs
[CLEANER] Loaded 207 blocked domains
[CLEANER] Loaded 312 disposable domains
[TLD-FIXER] Loaded 1523 IANA TLDs
[TLD-FIXER] Loaded 108 TLD fixes
[TLD-FIXER] Loaded 135 valid unusual TLDs
[SERVER] Tidy Mail running at http://localhost:3000


Open your browser and go to http://localhost:3000

---

## How To Use

1. Drag your CSV or Excel file onto the upload zone, or click to select
2. Click "Process File"
3. Watch the progress as it processes through all 8 stages
4. When complete, click "Download Results" to get your Excel file
5. Click "Process another file" to start over

The Excel file will contain multiple sheets showing your emails sliced by category and tag.

---

## Understanding The Output

### Primary Categories (mutually exclusive, every email has exactly one)

- **Google Workspace** — emails whose domain uses Google for email hosting
- **Non-Google** — emails on other providers (Microsoft 365, Zoho, etc.)
- **Removed** — emails that failed some check (invalid format, blocked TLD, no MX records, etc.)
- **Disposable** — emails from known temporary email services like mailinator.com
- **Needs Review** — emails with unusual patterns that require human judgment

### Tags (can co-exist with primary categories)

- **Trade-Based** — contains construction/trade industry keywords (electrician, plumber, HVAC, etc.)
- **Role-Based** — generic addresses like info@, admin@, support@
- **Catch-All** — domain shows signals of accepting mail for any address (heuristic-based)
- **Fixed** — email was modified during cleaning (TLD corrected, junk removed, etc.)

An email like electrician@builderco.com on Google MX would appear in:
- Google Workspace sheet
- Google - Trade sheet
- All Trade-Based sheet
- Full Log sheet

The stat counters on the results page show all these dimensions. Google Workspace + Non-Google + Removed + Disposable + Needs Review will always equal your total. Trade-Based and Role-Based counts overlap with the primary categories, they're additional context, not additional buckets.

---

## The Excel Report Structure

The generated Excel file contains these sheets:

1. **Summary** — headline stats and metadata
2. **Google Workspace** — all Google-hosted emails
3. **Google - Clean** — Google emails with no tags (pure targets)
4. **Google - Trade** — Google emails with trade keywords
5. **Google - Role** — Google emails that are role-based
6. **Google - CatchAll** — Google domains with catch-all signals
7. **Non-Google** — all non-Google emails
8. **Non-Google - Clean** — clean non-Google emails
9. **Non-Google - Trade** — trade-based non-Google emails
10. **Non-Google - Role** — role-based non-Google emails
11. **Non-Google - CatchAll** — non-Google with catch-all signals
12. **All Trade-Based** — every trade email regardless of provider
13. **All Role-Based** — every role email regardless of provider
14. **Removed** — emails that failed checks with reasons
15. **Disposable** — temporary email providers found
16. **Needs Review** — flagged for manual verification
17. **Full Log** — complete audit trail of every email and every action taken

---

## Configuration

All filter lists live in the `data/` folder and can be edited freely:

- `filter-words.txt` — words that trigger removal or role-based flagging
- `blocked-tlds.txt` — TLDs like .gov, .edu, .mil that get removed
- `blocked-domain-endings.txt` — specific domains to always remove
- `tld-fixes.json` — typo corrections like .con to .com
- `valid-unusual-tlds.txt` — new gTLDs that should be treated as valid
- `disposable-domains.txt` — known temporary email providers
- `iana-tlds.txt` — the full IANA TLD list

You can add or remove entries in any of these files. Restart the server after making changes.

---

## Performance Tuning

The default concurrency for DNS lookups is 70 simultaneous requests. This is set in `lib/dns-checker.js`:
const CONCURRENCY = 70;


If your ISP or router throttles DNS queries and you see lots of TIMEOUT errors, lower this to 30 or 40. If you have a fast connection and want to push harder, you can try 100. Most home connections work well between 40 and 80.

The DNS timeout per lookup is 3 seconds. You can change this in the same file:
async function safeLookup(fn, arg, type, timeoutMs = 3000)


---

## Project Structure
tidymail/
server.js main HTTP server
package.json dependencies and scripts
public/
index.html single-page interface
style.css all styles
app.js frontend controller
lib/
pipeline.js orchestrates all stages
parser.js CSV and Excel parser
cleaner.js email cleaning engine
tld-fixer.js TLD correction with Levenshtein
validator.js RFC 5322 validation
dns-checker.js DNS and MX lookups
categorizer.js final categorization
excel-generator.js Excel output builder
data/
filter-words.txt
blocked-tlds.txt
blocked-domain-endings.txt
tld-fixes.json
valid-unusual-tlds.txt
disposable-domains.txt
iana-tlds.txt
uploads/ auto-created, holds job data, auto-cleaned after 24h


---

## API Endpoints

If you want to integrate Tidy Mail with other tools, these endpoints are available:

- `POST /api/upload` — accepts multipart form data with a file field, returns { jobId }
- `GET /api/status/:jobId` — returns current job status JSON
- `GET /api/download/:jobId` — downloads the result Excel file
- `DELETE /api/job/:jobId` — deletes a job and its files

---

## Deployment

### Local Use

Just run `npm start` and use it on your own computer. Files never leave your machine.

### Railway

1. Push the repo to GitHub
2. Sign up at railway.app
3. New Project, Deploy from GitHub Repo, select your repo
4. Railway auto-detects Node.js and deploys
5. Add a domain in Settings

### Render

1. Push to GitHub
2. Sign up at render.com
3. New Web Service, connect your repo
4. Build Command: `npm install`
5. Start Command: `npm start`
6. Instance Type: Free tier works

### Vercel

Vercel is designed for serverless functions and doesn't work well with long-running Node.js servers that write files to disk. Use Railway or Render instead.

---

## Limitations

- Catch-all detection is heuristic only, based on DNS records. It's not a confirmed SMTP verification. Emails marked as catch-all might still be individual mailboxes, and emails not marked as catch-all might actually accept all addresses.
- DNS lookups only tell you if a domain can receive email, not if a specific mailbox exists. To verify individual mailboxes you'd need SMTP verification, which most email providers block or rate limit.
- The trade-based keyword list is opinionated toward construction and skilled trades industries. Adjust the TRADE_KEYWORDS array in `lib/cleaner.js` for your use case.
- Very large files (100,000+ emails) may take significant time due to DNS bottleneck. A typical run of 10,000 emails takes 2 to 5 minutes depending on DNS response times.
- The 24-hour auto-cleanup means downloaded results are only available for 24 hours after processing.

---

## Troubleshooting

**"npm: command not found"**
You need to install Node.js first. Download it from nodejs.org.

**Server starts but browser shows "connection refused"**
Make sure you're going to http://localhost:3000 and not https://. Also check that no other program is using port 3000.

**Lots of TIMEOUT errors in the terminal**
Your DNS is being throttled. Lower the CONCURRENCY value in `lib/dns-checker.js` from 70 to 30.

**"Cannot find module 'xlsx'"**
Run `npm install` in the project folder.

**Processing gets stuck at MX stage**
Some ISPs block outbound DNS queries. Try adding your own DNS servers at the top of `lib/dns-checker.js`, or use a VPN.

**Excel file won't open**
Make sure your Excel or LibreOffice is up to date. Very old versions may have trouble with the xlsx format used.

---

## License

Do whatever you want with this. Fork it, modify it, use it commercially, keep it private. No attribution required.

---

## Credits

Built as a focused tool for a specific workflow. Pencil loader animation adapted from a public codepen. Everything else written from scratch.<!-- gitpulse:contribution index="1788143302" timestamp="2026-08-31" -->
<!-- gitpulse:contribution index="1788191487" timestamp="2026-08-31" -->
