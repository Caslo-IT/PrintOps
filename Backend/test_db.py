import sqlite3

conn = sqlite3.connect('/Users/chamilkamihiraj/Desktop/GitHub/PrintOps/Backend/data storage/printops.db')
c = conn.cursor()
c.execute("SELECT id, name, assigned_printer_name FROM filaments")
for row in c.fetchall():
    print(row)
