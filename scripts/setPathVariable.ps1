<#
Add Clingo and Python to path in anaconda3.
#>
param (
    [string]$AddPath,
    [string]$RemovePath,
    [ValidateSet('Process', 'User', 'Machine')]
    [string]$Scope = 'User'
)

$paths = [System.Environment]::GetEnvironmentVariable('PATH', $Scope) -split ';'
$regexPaths = @()

# Search anaconda3 path when AddPath parameter.
if ($PSBoundParameters.Keys -contains 'AddPath'){
    # foreach( $path in $paths) {
    #     if ($path -match "\\anaconda3$") {
    #         break
    #     }
    # }
    # $AddPath = "$path\$AddPath"
    $regexPaths += [regex]::Escape($AddPath)
}

# When RemovePath parameter.
if ($PSBoundParameters.Keys -contains 'RemovePath'){
    $regexPaths += [regex]::Escape($RemovePath)
}

# Add or Remove path from PATH variable. Also removes empty values.
foreach ($path in $regexPaths) {
    $paths = $paths | Where-Object {$_ -notMatch "$path\\?"}
    $paths = $paths | Where-Object {$_ -notMatch "^\s*$"}
}

# Build and set PATH variable.
Write-Output "$addPath added to PATH environment variable"
$value = ($paths + $addPath) -join ';'
[System.Environment]::SetEnvironmentVariable('PATH', $value, $scope)
