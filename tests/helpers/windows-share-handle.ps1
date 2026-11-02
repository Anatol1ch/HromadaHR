param(
  [Parameter(Mandatory = $true)][string]$Path,
  [switch]$Hold
)

# Research probe only. Not imported or launched by HromadaHR.
# The existing file is retained; exclusivity comes from the OS handle, not its
# existence, timestamps, owner text, PID checks or a stale-lock timeout.
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

public static class SessionHandleProbe {
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern SafeFileHandle CreateFileW(string path, uint access,
    uint share, IntPtr security, uint disposition, uint attributes, IntPtr template);

  public static SafeFileHandle Acquire(string path, out int error) {
    // GENERIC_READ | GENERIC_WRITE, no sharing, OPEN_ALWAYS (never truncate).
    SafeFileHandle handle = CreateFileW(path, 0xC0000000, 0, IntPtr.Zero, 4, 0x80, IntPtr.Zero);
    error = handle.IsInvalid ? Marshal.GetLastWin32Error() : 0;
    return handle;
  }
}
'@

[int]$nativeError = 0
$handle = [SessionHandleProbe]::Acquire($Path, [ref]$nativeError)
try {
  $state = if (-not $handle.IsInvalid) { 'acquired' } elseif ($nativeError -eq 32) { 'contended' } else { 'unavailable' }
  [Console]::Out.WriteLine((@{ state = $state; win32Error = $nativeError } | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
  if ($state -eq 'acquired' -and $Hold) { $null = [Console]::In.ReadLine() }
} finally { $handle.Dispose() }
