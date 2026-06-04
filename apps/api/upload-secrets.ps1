# Reads .dev.vars and uploads each key as a Cloudflare Worker secret
# Usage: cd apps/api && .\upload-secrets.ps1

$devVars = Get-Content ".dev.vars"

foreach ($line in $devVars) {
    # Skip comments and empty lines
    if ($line -match '^\s*#' -or $line -match '^\s*$') { continue }

    # Parse KEY="VALUE" or KEY=VALUE
    if ($line -match '^([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$') {
        $key = $Matches[1]
        $value = $Matches[2]

        Write-Host "Uploading secret: $key" -ForegroundColor Cyan
        $value | pnpm wrangler secret put $key
    }
}

# Set production-specific overrides
Write-Host "Setting BETTER_AUTH_URL to production worker URL..." -ForegroundColor Yellow
"https://tusker-api.vamsimannam111.workers.dev" | pnpm wrangler secret put BETTER_AUTH_URL

Write-Host "Setting ALLOWED_ORIGINS..." -ForegroundColor Yellow
"http://localhost:3000" | pnpm wrangler secret put ALLOWED_ORIGINS

Write-Host "Done!" -ForegroundColor Green
