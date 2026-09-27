# Starts the three parts of Arclight Bank in separate windows:
#   1. ML service (FastAPI)      http://localhost:8000
#   2. Backend API (ASP.NET)     http://localhost:5073
#   3. Frontend (Next.js)        http://localhost:3000
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\ml-service'; .\venv\Scripts\python.exe -m uvicorn app:app --port 8000"
Start-Sleep -Seconds 4
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend'; dotnet run --no-launch-profile --urls http://localhost:5073"
Start-Sleep -Seconds 8
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\frontend'; npm run dev"

Write-Host "Starting... open http://localhost:3000 in about 30 seconds."
Write-Host "Customer app : http://localhost:3000/bank/login   (adaeze@example.com / password123, PIN 1234)"
Write-Host "Analyst portal: http://localhost:3000/admin/login"
