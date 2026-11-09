# Decompiles every address in addrs-line.txt from the copy of GameAssembly.dll; no full analysis.
$b = "$env:TEMP\gh12"
$list = (Get-Content "$PSScriptRoot\addrs-line.txt" -Raw).Trim() -split '\s+'
Remove-Item "$b\proj\*" -Recurse -Force -Confirm:$false -ErrorAction SilentlyContinue
$jh = (Get-ChildItem "$b\jdk25" | Select-Object -First 1).FullName
$env:JAVA_HOME = $jh; $env:PATH = "$jh\bin;$env:PATH"; $env:MAXMEM = "14G"
$ErrorActionPreference = "Continue"
& "$b\app\ghidra_12.2_PUBLIC\support\analyzeHeadless.bat" "$b\proj" wol3 -import "$b\GameAssembly.dll" -overwrite -noanalysis -scriptPath "$b" -postScript DecompAt.java @list -deleteProject 2>&1 | Out-File -Encoding utf8 "$b\decomp.log"
"codigo $LASTEXITCODE"
(Select-String -Path "$b\decomp.log" -Pattern "done 18").Count
Select-String -Path "$b\decomp.log" -Pattern "Exception|ERROR" | Select-Object -Last 3 | ForEach-Object { $_.Line.Substring(0, [Math]::Min(150, $_.Line.Length)) }
