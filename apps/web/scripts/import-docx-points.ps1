param(
  [string]$DocxDir = "c:\Developing\pontos",
  [string]$OutputJson = "c:\Developing\pontos\points-import.json"
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.IO.Compression.FileSystem

function Normalize-Text {
  param([string]$Text)

  if ([string]::IsNullOrWhiteSpace($Text)) { return '' }

  $clean = $Text -replace '\s+', ' '
  $clean = $clean -replace '\s+([,:;])', '$1'
  return $clean.Trim()
}

function Parse-MinimumInsertions {
  param([string]$Text)
  if ([string]::IsNullOrWhiteSpace($Text)) { return $null }
  $m = [regex]::Match($Text, '(\d[\d\.]*)')
  if (-not $m.Success) { return $null }
  $digits = ($m.Groups[1].Value -replace '\.', '')
  if ($digits -match '^\d+$') { return [int]$digits }
  return $null
}

function Infer-CityFromAddress {
  param([string]$Address)
  if ([string]::IsNullOrWhiteSpace($Address)) { return '' }

  $normalized = $Address -replace '–', '-'
  $parts = $normalized.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
  if ($parts.Count -eq 0) { return '' }

  $tail = $parts[-1]
  $stateMatch = [regex]::Match($tail, '(.+?)\s*-\s*[A-Z]{2}')
  if ($stateMatch.Success) {
    return Normalize-Text $stateMatch.Groups[1].Value
  }

  if ($parts.Count -ge 2) {
    $candidate = $parts[-2]
    $stateMatch2 = [regex]::Match($candidate, '(.+?)\s*-\s*[A-Z]{2}')
    if ($stateMatch2.Success) {
      return Normalize-Text $stateMatch2.Groups[1].Value
    }
  }

  return ''
}

function Slugify {
  param([string]$Text)
  if ([string]::IsNullOrWhiteSpace($Text)) { return 'ponto' }

  $t = $Text.Normalize([Text.NormalizationForm]::FormD)
  $sb = New-Object System.Text.StringBuilder
  foreach ($ch in $t.ToCharArray()) {
    $cat = [Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch)
    if ($cat -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
      [void]$sb.Append($ch)
    }
  }

  $ascii = $sb.ToString().ToLowerInvariant()
  $ascii = $ascii -replace '[^a-z0-9]+', '-'
  $ascii = $ascii -replace '(^-+|-+$)', ''
  if ([string]::IsNullOrWhiteSpace($ascii)) { return 'ponto' }
  return $ascii
}

function Infer-Type {
  param([string]$Name, [string]$Quantity, [string]$Dimensions)

  $blob = ("$Name $Quantity $Dimensions").ToLowerInvariant()
  if ($blob -match 'backlight') { return 'BackLights' }
  if ($blob -match 'frontlight') { return 'FrontLights' }
  if ($blob -match 'painel|led|video wall|v[ií]deo wall') { return 'Paineis de Led' }
  if ($blob -match 'elevador') { return 'Elevadores' }
  return 'Indoors'
}

function Infer-Screen {
  param([string]$Name, [string]$Quantity, [string]$Dimensions)

  $blob = ("$Name $Quantity $Dimensions").ToLowerInvariant()

  if ($blob -match '15\s*m\s*[x×]\s*2,?5\s*m') {
    return @{ width = 3000; height = 500 }
  }
  if ($blob -match 'horizontal|16:9|239"|painel') {
    return @{ width = 1920; height = 1080 }
  }
  if ($blob -match 'vertical|9:16|24"|55"') {
    return @{ width = 1080; height = 1920 }
  }

  return @{ width = 1080; height = 1920 }
}

function Parse-DocxText {
  param([string]$Path)

  $zip = [System.IO.Compression.ZipFile]::OpenRead($Path)
  try {
    $entry = $zip.Entries | Where-Object { $_.FullName -eq 'word/document.xml' } | Select-Object -First 1
    if (-not $entry) { return @() }

    $sr = New-Object System.IO.StreamReader($entry.Open())
    $xmlText = $sr.ReadToEnd()
    $sr.Close()

    [xml]$xml = $xmlText
    $ns = New-Object System.Xml.XmlNamespaceManager($xml.NameTable)
    $ns.AddNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main')

    $paragraphs = $xml.SelectNodes('//w:p', $ns)
    $lines = New-Object System.Collections.Generic.List[string]

    foreach ($p in $paragraphs) {
      $texts = $p.SelectNodes('.//w:t', $ns) | ForEach-Object { $_.'#text' }
      $line = Normalize-Text ($texts -join '')
      if (-not [string]::IsNullOrWhiteSpace($line)) {
        [void]$lines.Add($line)
      }
    }

    return $lines
  }
  finally {
    $zip.Dispose()
  }
}

function Parse-Records {
  param([string[]]$Lines)

  $records = New-Object System.Collections.Generic.List[hashtable]
  $current = $null

  function Get-LabelAndValue {
    param([string]$RawLine)

    $line = Normalize-Text $RawLine
    $idx = $line.IndexOf(':')
    if ($idx -lt 0) {
      return $null
    }

    $label = $line.Substring(0, $idx).Trim()
    $value = if ($idx + 1 -lt $line.Length) { $line.Substring($idx + 1).Trim() } else { '' }

    $labelNorm = $label.Normalize([Text.NormalizationForm]::FormD)
    $sb = New-Object System.Text.StringBuilder
    foreach ($ch in $labelNorm.ToCharArray()) {
      $cat = [Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch)
      if ($cat -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
        [void]$sb.Append($ch)
      }
    }
    $key = ($sb.ToString().ToLowerInvariant() -replace '\s+', ' ').Trim()

    if ($key -match 'endereco') { return @{ key = 'address'; value = $value } }
    if ($key -match 'coordenadas') { return @{ key = 'coordinates'; value = $value } }
    if ($key -match '^perfil$') { return @{ key = 'profile'; value = $value } }
    if ($key -match '^fluxo$') { return @{ key = 'flow'; value = $value } }
    if ($key -match 'total de inser') { return @{ key = 'totalInsertionsText'; value = $value } }
    if ($key -match 'quantidade de telas') { return @{ key = 'quantity'; value = $value } }
    if ($key -match '^valor$') { return @{ key = 'value'; value = $value } }
    if ($key -match 'tempo de looping') { return @{ key = 'loopTime'; value = $value } }
    if ($key -match 'dimensoes dos arquivos') { return @{ key = 'fileDimensions'; value = $value } }
    if ($key -match 'veiculacao') { return @{ key = 'vehicle'; value = $value } }

    return $null
  }

  function New-Record {
    param([string]$Name)
    return @{
      name = $Name
      address = ''
      coordinates = ''
      profile = ''
      flow = ''
      totalInsertionsText = ''
      quantity = ''
      value = ''
      loopTime = ''
      fileDimensions = ''
      vehicle = ''
    }
  }

  function Is-ValidName {
    param([string]$Name)
    if ([string]::IsNullOrWhiteSpace($Name)) { return $false }
    $n = $Name.ToLowerInvariant()
    if ($n -match '^endere') { return $false }
    if ($n -match '^coordenadas') { return $false }
    if ($n -match '^total de inser') { return $false }
    if ($n -match '^quantidade de telas') { return $false }
    if ($n -match '^tempo de looping') { return $false }
    if ($n -match '^perfil$|^fluxo$|^valor$') { return $false }
    return $true
  }

  for ($i = 0; $i -lt $Lines.Count; $i++) {
    $line = Normalize-Text $Lines[$i]
    if ([string]::IsNullOrWhiteSpace($line)) { continue }

    $field = Get-LabelAndValue -RawLine $line
    if ($field) {
      if (-not $current) {
        continue
      }

      $value = $field.value
      if ($field.key -eq 'coordinates' -and [string]::IsNullOrWhiteSpace($value)) {
        # Handle broken extraction where coordinates are prefixed by a numeric chunk
        $m = [regex]::Match($line, '(-?\d+\.?\d*\s*,\s*-?\d+\.?\d*)')
        if ($m.Success) { $value = $m.Groups[1].Value }
      }

      $current[$field.key] = Normalize-Text $value
      continue
    }

    if (Is-ValidName -Name $line) {
      if ($current) {
        [void]$records.Add($current)
      }
      $current = New-Record -Name $line
      continue
    }
  }

  if ($current) { [void]$records.Add($current) }

  return @($records | Where-Object {
    Is-ValidName -Name $_.name
  })
}

$docxFiles = Get-ChildItem -Path $DocxDir -Filter '*.docx' | Sort-Object Name
if (-not $docxFiles) {
  throw "Nenhum arquivo .docx encontrado em: $DocxDir"
}

$allRecords = New-Object System.Collections.Generic.List[object]
$slugSet = New-Object System.Collections.Generic.HashSet[string]

foreach ($file in $docxFiles) {
  $lines = Parse-DocxText -Path $file.FullName
  $records = Parse-Records -Lines $lines

  $seq = 1
  foreach ($r in $records) {
    $city = Infer-CityFromAddress -Address $r.address
    $type = Infer-Type -Name $r.name -Quantity $r.quantity -Dimensions $r.fileDimensions
    $screen = Infer-Screen -Name $r.name -Quantity $r.quantity -Dimensions $r.fileDimensions

    $baseSlug = Slugify -Text ("$($r.name)-$city")
    $slug = $baseSlug
    while ($slugSet.Contains($slug)) {
      $seq++
      $slug = "$baseSlug-$seq"
    }
    [void]$slugSet.Add($slug)

    $descParts = @()
    if ($r.quantity) { $descParts += "Quantidade de telas: $($r.quantity)" }
    if ($r.flow) { $descParts += "Fluxo: $($r.flow)" }
    if ($r.loopTime) { $descParts += "Looping: $($r.loopTime)" }
    if ($r.fileDimensions) { $descParts += "Dimensões: $($r.fileDimensions)" }
    if ($r.vehicle) { $descParts += "Veiculação: $($r.vehicle)" }

    $description = ($descParts -join ' | ')

    $obj = [ordered]@{
      name = $r.name
      slug = $slug
      type = $type
      city = $city
      address = $r.address
      description = $description
      insertionType = $r.quantity
      minimumInsertions = Parse-MinimumInsertions -Text $r.totalInsertionsText
      targetAudience = $r.profile
      audienceClassification = ''
      thumbnailUrl = ''
      baseMediaUrl = ''
      baseMediaType = if ($type -eq 'BackLights') { 'image' } else { 'image' }
      baseWidth = $screen.width
      baseHeight = $screen.height
      screenWidth = $screen.width
      screenHeight = $screen.height
      fitMode = 'cover'
      screenSelection = @{ mode = 'quad' }
      renderPreset = @{
        screenNits = 700
        bloom = 0.12
        glassReflection = 0.08
        grain = 0.06
        cinematicMode = $true
      }
      environmentType = if ($type -eq 'Elevadores') { 'elevator' } elseif ($type -eq 'Indoors') { 'shopping' } else { 'street' }
      published = $false
      sourceDoc = $file.Name
      coordinates = $r.coordinates
      loopTime = $r.loopTime
      quantityText = $r.quantity
      totalInsertionsText = $r.totalInsertionsText
    }

    [void]$allRecords.Add($obj)
  }
}

$allRecords | ConvertTo-Json -Depth 8 | Set-Content -Path $OutputJson -Encoding UTF8

Write-Output "Gerado: $OutputJson"
Write-Output "Total de registros: $($allRecords.Count)"
