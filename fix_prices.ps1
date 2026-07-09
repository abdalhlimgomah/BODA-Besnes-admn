$supabaseUrl = "https://msgqzgzoslearaprgiqq.supabase.co"
$anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE"
$headers = @{
  "apikey" = $anonKey
  "Authorization" = "Bearer $anonKey"
  "Content-Type" = "application/json"
}

# 1. Fetch all products
$allProducts = @()
$from = 0
$pageSize = 1000
do {
  $url = "$supabaseUrl/rest/v1/taager_products?select=id,name,quick_details,content_ideas&order=created_at.desc&limit=$pageSize&offset=$from"
  $data = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
  if ($data.Count -eq 0) { break }
  $allProducts += $data
  $from += $pageSize
  Write-Host "تم جلب $($allProducts.Count) منتج..."
} while ($data.Count -eq $pageSize)

Write-Host "`nإجمالي المنتجات: $($allProducts.Count)"
$fixed = 0

# 2. Fix each product - remove only price patterns
foreach ($p in $allProducts) {
  $needsUpdate = $false
  $newQd = $p.quick_details
  $newCi = $p.content_ideas

  # Patterns to remove (only price text, keep everything else)
  $patterns = @(
    '\s*سعر\s*(منافس|:)?\s*[\d,]+\.?\d*\s*(ج\.م|جنيه)',
    '\s*Price\s*:?\s*[\d,]+\.?\d*',
    '\s*[\d,]+\.?\d*\s*ج\.م\s*',
    '✅\s*سعر\s*منافس\s*:?\s*[\d,]+\.?\d*\s*(ج\.م|جنيه)'
  )

  foreach ($pat in $patterns) {
    if ($newQd -match $pat) { $newQd = $newQd -replace $pat, ''; $needsUpdate = $true }
    if ($newCi -match $pat) { $newCi = $newCi -replace $pat, ''; $needsUpdate = $true }
  }

  # Clean up extra spaces / newlines
  if ($needsUpdate) {
    $newQd = $newQd -replace '\s{2,}', ' ' -replace '^\s+|\s+$', ''
    $newCi = $newCi -replace '\n{3,}', "`n`n" -replace '^\s+|\s+$', ''

    # Update in Supabase
    $body = @{ quick_details = $newQd; content_ideas = $newCi } | ConvertTo-Json
    $updateUrl = "$supabaseUrl/rest/v1/taager_products?id=eq.$([System.Uri]::EscapeDataString($p.id))"
    try {
      Invoke-RestMethod -Uri $updateUrl -Headers $headers -Method Patch -Body $body
      $fixed++
    } catch {
      Write-Host "فشل تحديث $($p.id): $_" -ForegroundColor Red
    }
  }
}

Write-Host "`n================================" -ForegroundColor Green
Write-Host "تم إصلاح $fixed منتج" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
