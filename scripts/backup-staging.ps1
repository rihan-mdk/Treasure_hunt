# ============================================================================
# THE HUNT EXPEDITION -- STAGING BACKUP AUTOMATION SCRIPT (CHECKPOINT A)
# Strict Target: uguvotvttdtclnhbsywr (Staging)
# Production Ref: kcupmzqnyitkchkmftcl (STRICTLY FORBIDDEN)
# ============================================================================

$ErrorActionPreference = "Stop"

$FORBIDDEN_PRODUCTION_REF = "kcupmzqnyitkchkmftcl"
$AUTHORIZED_STAGING_REF = "uguvotvttdtclnhbsywr"

$pgDumpPath = "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe"
$pgRestorePath = "C:\Program Files\PostgreSQL\17\bin\pg_restore.exe"

# 1. Verify client tools exist
if (-not (Test-Path $pgDumpPath)) {
    Write-Error "CRITICAL: pg_dump.exe not found at '$pgDumpPath'."
    exit 1
}
if (-not (Test-Path $pgRestorePath)) {
    Write-Error "CRITICAL: pg_restore.exe not found at '$pgRestorePath'."
    exit 1
}

# 2. Ensure backup destination directory exists
$backupDir = Join-Path $HOME "the-hunt-backups"
if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
}
$backupFile = Join-Path $backupDir "staging_baseline.dump"

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host " THE HUNT EXPEDITION -- STAGING BACKUP AUTOMATION (CHECKPOINT A)" -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "Authorized Staging Project Ref: $AUTHORIZED_STAGING_REF"
Write-Host "Production Project Ref:         $FORBIDDEN_PRODUCTION_REF [STRICTLY OFF-LIMITS]"
Write-Host ""

# 3. Securely collect connection details from local prompt
Write-Host "Please enter staging connection details (Supabase Dashboard -> Database -> Connection Pooling):" -ForegroundColor Yellow

$inputHost = Read-Host -Prompt "Host (e.g. aws-0-ap-south-1.pooler.supabase.com or db.uguvotvttdtclnhbsywr.supabase.co)"
$inputPort = Read-Host -Prompt "Port [Default: 5432]"
if ([string]::IsNullOrWhiteSpace($inputPort)) { $inputPort = "5432" }

$inputDb = Read-Host -Prompt "Database [Default: postgres]"
if ([string]::IsNullOrWhiteSpace($inputDb)) { $inputDb = "postgres" }

$inputUser = Read-Host -Prompt "Username (e.g. postgres.uguvotvttdtclnhbsywr or postgres)"

# 4. Strict Safety Guard Checks
if ($inputHost -like "*$FORBIDDEN_PRODUCTION_REF*" -or $inputUser -like "*$FORBIDDEN_PRODUCTION_REF*") {
    Write-Host ""
    Write-Error "FATAL SECURITY TRAP: Connection details reference forbidden production project '$FORBIDDEN_PRODUCTION_REF'! Aborting immediately."
    exit 1
}

# Verify staging reference is present in either host or user
if (-not ($inputHost -like "*$AUTHORIZED_STAGING_REF*" -or $inputUser -like "*$AUTHORIZED_STAGING_REF*")) {
    Write-Host ""
    Write-Error "TARGET VERIFICATION ERROR: Connection details do not reference authorized staging project '$AUTHORIZED_STAGING_REF'! Aborting."
    exit 1
}

# Secure password prompt (hidden input)
$securePassword = Read-Host -Prompt "Enter Database Password" -AsSecureString
$plainPassword = (New-Object System.Net.NetworkCredential("", $securePassword)).Password

# 5. Non-Secret Target Display for Operator Confirmation
Write-Host ""
Write-Host "--------------------------------------------------------------------------------" -ForegroundColor Cyan
Write-Host "TARGET CONNECTION CONFIRMATION (NO SECRETS SHOWN):" -ForegroundColor Cyan
Write-Host "  Project Ref: $AUTHORIZED_STAGING_REF"
Write-Host "  Host:        $inputHost"
Write-Host "  Port:        $inputPort"
Write-Host "  Database:    $inputDb"
Write-Host "  Username:    $inputUser"
Write-Host "  Destination: $backupFile"
Write-Host "--------------------------------------------------------------------------------" -ForegroundColor Cyan

$confirm = Read-Host -Prompt "Confirm that this target is STAGING ($AUTHORIZED_STAGING_REF) and proceed with backup? (yes/no)"
if ($confirm -ne "yes") {
    Write-Host "Backup cancelled by user. No connection made." -ForegroundColor Yellow
    $plainPassword = $null
    exit 0
}

# 6. Execute pg_dump with temporary memory-only password
Write-Host ""
Write-Host "Executing pg_dump (custom format, no-owner, no-privileges)..." -ForegroundColor Green

$env:PGPASSWORD = $plainPassword
$plainPassword = $null

$dumpExitCode = 1
$dumpOutput = ""

try {
    # Custom format, no-owner, no-privileges, no --clean, no --if-exists
    $dumpArgs = @(
        "--host=$inputHost",
        "--port=$inputPort",
        "--username=$inputUser",
        "--dbname=$inputDb",
        "--format=custom",
        "--no-owner",
        "--no-privileges",
        "--file=$backupFile"
    )

    $dumpOutput = & $pgDumpPath @dumpArgs 2>&1
    $dumpExitCode = $LASTEXITCODE
}
finally {
    # Immediately wipe password from environment memory
    $env:PGPASSWORD = $null
    [System.Environment]::SetEnvironmentVariable("PGPASSWORD", $null, "Process")
}

# 7. Check exit code
if ($dumpExitCode -ne 0) {
    Write-Host ""
    if ($dumpOutput -like "*password authentication failed*") {
        Write-Host "HINT: Password authentication failed. In Supabase, the database password is set in:" -ForegroundColor Yellow
        Write-Host "      Dashboard -> Project Settings (uguvotvttdtclnhbsywr) -> Database -> Database password." -ForegroundColor Yellow
        Write-Host "      If needed, reset the database password in the dashboard and re-run." -ForegroundColor Yellow
        Write-Host ""
    }
    Write-Error "pg_dump failed with exit code $dumpExitCode. Sanitized output:`n$dumpOutput"
    exit $dumpExitCode
}

# 8. Verify backup file exists and is non-empty
if (-not (Test-Path $backupFile)) {
    Write-Error "Backup file was not created at '$backupFile'."
    exit 1
}

$fileItem = Get-Item $backupFile
if ($fileItem.Length -le 0) {
    Write-Error "Backup file was created but is empty (0 bytes)."
    exit 1
}

Write-Host "Backup created successfully. File size: $($fileItem.Length) bytes." -ForegroundColor Green

# 9. Verify archive table of contents using pg_restore --list
Write-Host ""
Write-Host "Verifying archive integrity with pg_restore --list..." -ForegroundColor Green
$restoreOutput = & $pgRestorePath --list $backupFile
$restoreExitCode = $LASTEXITCODE

if ($restoreExitCode -ne 0) {
    Write-Error "pg_restore --list failed on the generated archive."
    exit $restoreExitCode
}

Write-Host "Archive integrity verified. Archive contains valid PostgreSQL TOC." -ForegroundColor Green
Write-Host ""
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host " STAGING BACKUP COMPLETED AND VERIFIED (CHECKPOINT A)" -ForegroundColor Cyan
Write-Host "  Path:        $backupFile"
Write-Host "  Size:        $($fileItem.Length) bytes"
Write-Host "  Verification: PASSED (pg_restore --list valid)"
Write-Host "================================================================================" -ForegroundColor Cyan
