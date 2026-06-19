# gym-share-app
The purpose of sharing gym schedules is to maintain motivation and to smoothly plan joint training sessions.

# API仕様
送信はWebが送る内容
返信は処理側が送ってWebが受け取る内容

POSTは情報を送りたいときに使う合言葉
GETは情報を受け取りたいときに使う合言葉

## ユーザー登録

POST /api/register

送信:
{
    "username": "takuya",
    "password": "password"
}

返信:
{
    "result": "success",
    "message": "account is made"
}

{
    "result": "error",
    "message": "username already exists"
}

## ログイン

POST /api/login
送信:
{
    "username": "takuya",
    "password": "password"
}

返信:
{
    "access_token": "******",
    "token_type": "bearer"
}

## 記録追加

POST /api/workouts

送信:
{
    "exercise": "bench_press",
    "weight": 80,
    "reps" : 5
}

{
    "results": "success"
}

## 記録取得
GET /api/workouts

返信:
{
    {
        "exercise": "bench_press",
        "weight": 80,
        "reps" : 5
    }
}
