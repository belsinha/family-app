# Script to open firewall ports for Family App
# Run this script as Administrator

Write-Host "Adding firewall rules for Family App..." -ForegroundColor Green

# Add firewall rule for frontend (port 3000)
netsh advfirewall firewall add rule name="Family App Frontend" dir=in action=allow protocol=TCP localport=3000

# Add firewall rule for backend (port 3001)
netsh advfirewall firewall add rule name="Family App Backend" dir=in action=allow protocol=TCP localport=3001

Write-Host "Firewall rules added successfully!" -ForegroundColor Green
Write-Host "Ports 3000 and 3001 are now open for incoming connections." -ForegroundColor Green
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")




