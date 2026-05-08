Add-Type -AssemblyName System.Windows.Forms
$vs = [System.Windows.Forms.SystemInformation]::VirtualScreen
Write-Output ("VirtualScreen: x={0} y={1} w={2} h={3}" -f $vs.X, $vs.Y, $vs.Width, $vs.Height)
foreach ($s in [System.Windows.Forms.Screen]::AllScreens) {
    Write-Output ("Screen: bounds={0} primary={1}" -f $s.Bounds, $s.Primary)
}
