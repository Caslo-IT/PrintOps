import requests

# Test creating a filament and assigning a printer
res = requests.post("http://localhost:5000/filaments", json={
    "name": "Test Filament",
    "material": "PLA",
    "color": "Red",
    "total_weight_g": 1000,
    "remaining_weight_g": 1000,
    "assigned_printer_name": "Printer A"
})
print("Create:", res.json())

# Test updating
res = requests.put(f"http://localhost:5000/filaments/{res.json()['filament']['id']}", json={
    "assigned_printer_name": "Printer B"
})
print("Update:", res.json())
