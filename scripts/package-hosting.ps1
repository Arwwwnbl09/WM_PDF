$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$hostingRoot = Join-Path $projectRoot 'output/hosting'
$packageId = [Guid]::NewGuid().ToString('N')
$stagingPath = Join-Path $hostingRoot "staging-$packageId"
$temporaryArchive = Join-Path $hostingRoot "package-$packageId.zip"
$archivePath = Join-Path $hostingRoot 'Secure-PDF-Watermark.zip'

function Assert-ContainedPath {
    param([string]$ParentPath, [string]$CandidatePath)

    $parent = [IO.Path]::GetFullPath($ParentPath).TrimEnd([char[]]'\/') + [IO.Path]::DirectorySeparatorChar
    $candidate = [IO.Path]::GetFullPath($CandidatePath)
    if (-not $candidate.StartsWith($parent, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Path di luar folder yang diizinkan: $candidate"
    }
}

function Copy-PackageFile {
    param([string]$RelativePath)

    $source = Join-Path $projectRoot $RelativePath
    $destination = Join-Path $stagingPath $RelativePath
    Assert-ContainedPath $projectRoot $source
    Assert-ContainedPath $stagingPath $destination
    $item = Get-Item -LiteralPath $source -Force
    if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw "Paket hanya menerima file biasa: $RelativePath"
    }
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination
}

function Copy-PackageDirectory {
    param(
        [string]$RelativePath,
        [string[]]$Extensions = @(),
        [string[]]$ExcludedFolders = @()
    )

    $source = Join-Path $projectRoot $RelativePath
    Assert-ContainedPath $projectRoot $source
    foreach ($item in Get-ChildItem -LiteralPath $source -Recurse -File -Force) {
        $localPath = $item.FullName.Substring($source.Length).TrimStart([char[]]'\/')
        $folders = $localPath -split '[\\/]'
        $excluded = $false
        foreach ($folder in $ExcludedFolders) {
            if ($folders -contains $folder) { $excluded = $true; break }
        }
        if ($excluded -or $item.Name -like '.env*') { continue }
        if ($Extensions.Count -gt 0 -and $Extensions -notcontains $item.Extension) { continue }
        Copy-PackageFile (Join-Path $RelativePath $localPath)
    }
}

Assert-ContainedPath $projectRoot $hostingRoot
Assert-ContainedPath $hostingRoot $stagingPath
Assert-ContainedPath $hostingRoot $temporaryArchive
Assert-ContainedPath $hostingRoot $archivePath
New-Item -ItemType Directory -Path $stagingPath -Force | Out-Null

try {
    $files = @(
        'frontend/package.json',
        'frontend/package-lock.json',
        'frontend/next.config.ts',
        'frontend/tsconfig.json',
        'frontend/postcss.config.mjs',
        'frontend/eslint.config.mjs',
        'frontend/.env.example',
        'frontend/vercel.json',
        'frontend/README.md',
        'README.md',
        'vercel.json',
        'render.yaml',
        'frontend/scripts/prepare-pdf-assets.mjs',
        'scripts/package-hosting.ps1',
        'backend/requirements.txt',
        'backend/requirements.lock.txt',
        'backend/.env.example',
        'backend/README.md',
        'backend/Dockerfile',
        'backend/.dockerignore',
        'backend/vercel.json'
    )
    foreach ($file in $files) { Copy-PackageFile $file }
    Copy-PackageDirectory 'frontend/src' -Extensions @('.ts', '.tsx', '.css', '.json', '.svg')
    Copy-PackageDirectory 'backend/app' -Extensions @('.py') -ExcludedFolders @('__pycache__')
    if (Test-Path -LiteralPath (Join-Path $projectRoot 'frontend/public')) {
        Copy-PackageDirectory 'frontend/public' -ExcludedFolders @('pdfjs')
    }

    Compress-Archive -Path (Join-Path $stagingPath '*') -DestinationPath $temporaryArchive -CompressionLevel Optimal
    Move-Item -LiteralPath $temporaryArchive -Destination $archivePath -Force
    $package = Get-Item -LiteralPath $archivePath
    Write-Output "Paket hosting: $($package.FullName)"
    Write-Output ("Ukuran: {0:N0} KB" -f ($package.Length / 1KB))
}
finally {
    # Cleanup is limited to this invocation's staging folder and temporary ZIP.
    Assert-ContainedPath $hostingRoot $stagingPath
    if (Test-Path -LiteralPath $stagingPath) {
        Remove-Item -LiteralPath $stagingPath -Recurse -Force
    }
    Assert-ContainedPath $hostingRoot $temporaryArchive
    if (Test-Path -LiteralPath $temporaryArchive) {
        Remove-Item -LiteralPath $temporaryArchive -Force
    }
}
