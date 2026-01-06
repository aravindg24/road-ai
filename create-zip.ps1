# Get all items excluding sensitive files and directories
$items = Get-ChildItem -Path . -Exclude '.env','.git','node_modules','*.log','Road_AI_Backend_Colab_FIXED.ipynb','removed-object-1764535233438.png','create-zip.ps1','road-ai-project.zip'

# Create the zip file
Compress-Archive -Path $items.FullName -DestinationPath 'road-ai-project.zip' -Force -CompressionLevel Optimal

Write-Host "Zip file created successfully: road-ai-project.zip"
