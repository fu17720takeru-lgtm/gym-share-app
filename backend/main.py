#venvを起動するには Mac:　source venv/bin/activate  Win: venv/Scripts/activate
#実行するには　uvicorn mina:app --reloadでブラウザでhttp://localhost:8000
from fastapi import FastAPI
import models
import hash

app = FastAPI()

@app.get("/") #最初の画面
def read_root():
    return {"messsage": "Hello World"}

@app.post("/api/register") #アカウント登録
def regist(data: models.Regist):
    return 0

@app.post("/api/login") #ログイン
def login(data: models.Login):
    return 0

@app.post("/api/workouts") #運動記録
def workout(data: models.Workouts):
    return 0

@app.get("/api/workouts") #運動記録を閲覧
def workout():
    return 0

if __name__ == '__main__':
    print(hash.hash('abcdef'))