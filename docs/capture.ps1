param(
    [Parameter(Mandatory=$true)][string]$OutPath,
    [int]$X = -1,
    [int]$Y = -1,
    [int]$W = -1,
    [int]$H = -1,
    [int]$DelayMs = 200,
    [switch]$NoForeground
)
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

if (-not $NoForeground) {
    try {
        $shell = New-Object -ComObject WScript.Shell
        $shell.AppActivate("Zotero") | Out-Null
        Start-Sleep -Milliseconds 100
    } catch {}
}

if ($DelayMs -gt 0) { Start-Sleep -Milliseconds $DelayMs }

$bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)

if ($X -ge 0 -and $Y -ge 0 -and $W -gt 0 -and $H -gt 0) {
    $crop = New-Object System.Drawing.Rectangle $X, $Y, $W, $H
    $cropped = $bmp.Clone($crop, $bmp.PixelFormat)
    $cropped.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $cropped.Dispose()
} else {
    $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
}

$gfx.Dispose()
$bmp.Dispose()
Write-Output "Saved $OutPath"
