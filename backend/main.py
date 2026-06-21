#venvを起動するには Mac:　source venv/bin/activate  Win: venv/Scripts/activate
#実行するには　uvicorn mina:app --reloadでブラウザでhttp://localhost:8000
from argon2 import PasswordHasher
from fastapi import FastAPI
import models
'''
# PasswordHasherのインスタンスを作成（デフォルト設定を使用）
ph = PasswordHasher()
# ハッシュ化したいパスワード
password = "mysecretpassword"
# パスワードをハッシュ化
# hash()メソッドは内部で自動的に安全なソルトを生成します
hashed_password = ph.hash(password)
print(f"元のパスワード: {password}")
print(f"ハッシュ化されたパスワード: {hashed_password}")
# 生成されたハッシュ値の例 (実行ごとにソルトが異なるため、結果は変わります):
# $argon2id$v=19$m=65536,t=3,p=4$MIIRqgvgQbgj220jfp0MPA$YfwJSVjtjSU0zzV/P3S9nnQ/USre2wvJMjfCIjrTQbg
'''

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