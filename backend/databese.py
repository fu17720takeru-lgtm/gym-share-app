import sqlite3

conn = sqlite3.connect('./backend/data/app.db')

cur = conn.cursor()
cur.execute('CREATE TABLE persons(id INTEGER PRIMARY KEY AUTOINCREMENT, name STRING)')

conn.commit()
conn.close()