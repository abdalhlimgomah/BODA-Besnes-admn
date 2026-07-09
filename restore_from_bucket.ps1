$supabaseUrl = "https://msgqzgzoslearaprgiqq.supabase.co"
$anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE"
$headers = @{ "apikey" = $anonKey; "Authorization" = "Bearer $anonKey" }

Write-Host "1. جلب قائمة الملفات من ai-details bucket..."
$listUrl = "$supabaseUrl/storage/v1/object/list/ai-details"
$listBody = @{ limit = 10000; offset = 0 } | ConvertTo-Json
$files = Invoke-RestMethod -Uri $listUrl -Headers $headers -Method Post -Body $listBody -ContentType "application/json"
Write-Host "   -> $($files.Count) ملف JSON"

$restored = 0
$errors = 0

foreach ($f in $files) {
  if (-not $f.name.EndsWith(".json")) { continue }
  $productId = $f.name -replace '\.json$', ''

  # Download file
  $dlUrl = "$supabaseUrl/storage/v1/object/ai-details/$($f.name)"
  try {
    $json = Invoke-RestMethod -Uri $dlUrl -Headers $headers -Method Get
    if (-not $json.quick_details -or -not $json.content_ideas) { continue }

    # Update taager_products
    $updateBody = @{ quick_details = $json.quick_details; content_ideas = $json.content_ideas } | ConvertTo-Json
    $updateUrl = "$supabaseUrl/rest/v1/taager_products?id=eq.$([System.Uri]::EscapeDataString($productId))"
    $updateHeaders = $headers.Clone()
    $updateHeaders["Content-Type"] = "application/json"
    Invoke-RestMethod -Uri $updateUrl -Headers $updateHeaders -Method Patch -Body $updateBody
    $restored++
    Write-Host "   تم استعادة $productId" -ForegroundColor Green
  } catch {
    $errors++
    Write-Host "   فشل $productId : $_" -ForegroundColor Red
  }
}

Write-Host "`n================================"
Write-Host "تم استعادة $restored منتج" -ForegroundColor Green
if ($errors) { Write-Host "$errors فشل" -ForegroundColor Red }
Write-Host "================================"
