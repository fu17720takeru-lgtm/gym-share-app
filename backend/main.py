import secrets
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
import models
import hash as h
import auth
import database

app = FastAPI(title="GymShare API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

database.init_db()


# ─── 認証 ───────────────────────────────────────────────────

@app.post("/api/register")
def register(data: models.Register):
    db = database.get_db()
    try:
        existing = db.execute("SELECT id FROM users WHERE username = %s", (data.username,)).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="このユーザー名は既に使われています")
        pw_hash = h.hash_password(data.password)
        cur = db.execute(
            "INSERT INTO users (username, password_hash) VALUES (%s, %s) RETURNING id",
            (data.username, pw_hash),
        )
        user_id = cur.fetchone()["id"]
        db.commit()
        token = auth.create_access_token(user_id, data.username)
        return {"token": token, "username": data.username}
    finally:
        db.close()


@app.post("/api/login")
def login(data: models.Login):
    db = database.get_db()
    try:
        row = db.execute(
            "SELECT id, password_hash FROM users WHERE username = %s", (data.username,)
        ).fetchone()
        if not row or not h.verify_password(data.password, row["password_hash"]):
            raise HTTPException(status_code=401, detail="ユーザー名またはパスワードが違います")
        token = auth.create_access_token(row["id"], data.username)
        return {"token": token, "username": data.username}
    finally:
        db.close()


@app.get("/api/me")
def me(current_user=Depends(auth.get_current_user)):
    return current_user


# ─── グループ ─────────────────────────────────────────────

@app.post("/api/groups")
def create_group(data: models.GroupCreate, current_user=Depends(auth.get_current_user)):
    db = database.get_db()
    try:
        invite_code = secrets.token_urlsafe(6)
        cur = db.execute(
            "INSERT INTO groups (name, description, invite_code, created_by) VALUES (%s, %s, %s, %s) RETURNING id",
            (data.name, data.description, invite_code, current_user["id"]),
        )
        group_id = cur.fetchone()["id"]
        db.execute(
            "INSERT INTO group_members (group_id, user_id, role) VALUES (%s, %s, 'owner')",
            (group_id, current_user["id"]),
        )
        db.commit()
        return {"id": group_id, "name": data.name, "invite_code": invite_code}
    finally:
        db.close()


@app.get("/api/groups")
def list_groups(current_user=Depends(auth.get_current_user)):
    db = database.get_db()
    try:
        rows = db.execute(
            """SELECT g.id, g.name, g.description, g.invite_code, g.created_at,
                      COUNT(gm2.user_id) as member_count
               FROM groups g
               JOIN group_members gm ON g.id = gm.group_id AND gm.user_id = %s
               LEFT JOIN group_members gm2 ON g.id = gm2.group_id
               GROUP BY g.id""",
            (current_user["id"],),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        db.close()


@app.post("/api/groups/join")
def join_group(data: models.GroupJoin, current_user=Depends(auth.get_current_user)):
    db = database.get_db()
    try:
        group = db.execute(
            "SELECT id, name FROM groups WHERE invite_code = %s", (data.invite_code,)
        ).fetchone()
        if not group:
            raise HTTPException(status_code=404, detail="招待コードが無効です")
        existing = db.execute(
            "SELECT id FROM group_members WHERE group_id = %s AND user_id = %s",
            (group["id"], current_user["id"]),
        ).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="既にグループに参加しています")
        db.execute(
            "INSERT INTO group_members (group_id, user_id) VALUES (%s, %s)",
            (group["id"], current_user["id"]),
        )
        db.commit()
        return {"message": f"「{group['name']}」に参加しました", "group_id": group["id"]}
    finally:
        db.close()


@app.get("/api/groups/{group_id}/members")
def group_members(group_id: int, current_user=Depends(auth.get_current_user)):
    db = database.get_db()
    try:
        _assert_member(db, group_id, current_user["id"])
        rows = db.execute(
            """SELECT u.id, u.username, gm.role, gm.joined_at
               FROM group_members gm JOIN users u ON gm.user_id = u.id
               WHERE gm.group_id = %s""",
            (group_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        db.close()


# ─── 筋トレ記録 ──────────────────────────────────────────

@app.post("/api/workouts")
def add_workout(data: models.WorkoutIn, current_user=Depends(auth.get_current_user)):
    db = database.get_db()
    try:
        cur = db.execute(
            "INSERT INTO workouts (user_id, date, memo) VALUES (%s, %s, %s) RETURNING id",
            (current_user["id"], data.date, data.memo),
        )
        workout_id = cur.fetchone()["id"]
        for ex in data.exercises:
            db.execute(
                "INSERT INTO workout_exercises (workout_id, exercise, sets, reps, weight) VALUES (%s, %s, %s, %s, %s)",
                (workout_id, ex.exercise, ex.sets, ex.reps, ex.weight),
            )
        db.commit()
        return {"id": workout_id, "date": data.date}
    finally:
        db.close()


@app.get("/api/exercises/{exercise_name}/pr")
def get_pr(exercise_name: str, current_user=Depends(auth.get_current_user)):
    db = database.get_db()
    try:
        row = db.execute(
            """SELECT MAX(weight * (1 + COALESCE(reps, 1) / 30.0)) as max_rm
               FROM workout_exercises we
               JOIN workouts w ON we.workout_id = w.id
               WHERE w.user_id = %s AND we.exercise = %s AND weight IS NOT NULL""",
            (current_user["id"], exercise_name),
        ).fetchone()
        return {"pr_rm": round(row["max_rm"], 1) if row and row["max_rm"] else None}
    finally:
        db.close()


@app.get("/api/exercises/{exercise_name}/last")
def last_exercise_record(exercise_name: str, current_user=Depends(auth.get_current_user)):
    db = database.get_db()
    try:
        rows = db.execute(
            """SELECT we.weight, we.reps, w.date
               FROM workout_exercises we
               JOIN workouts w ON we.workout_id = w.id
               WHERE w.user_id = %s AND we.exercise = %s
               ORDER BY w.date DESC, we.id ASC""",
            (current_user["id"], exercise_name),
        ).fetchall()
        if not rows:
            return None
        return {"sets": [{"weight": r["weight"], "reps": r["reps"]} for r in rows], "date": rows[0]["date"]}
    finally:
        db.close()


@app.get("/api/workouts/me")
def my_workouts(current_user=Depends(auth.get_current_user)):
    db = database.get_db()
    try:
        return _fetch_workouts(db, current_user["id"], current_user["id"])
    finally:
        db.close()


@app.get("/api/groups/{group_id}/workouts")
def group_workouts(group_id: int, current_user=Depends(auth.get_current_user)):
    db = database.get_db()
    try:
        _assert_member(db, group_id, current_user["id"])
        member_ids = db.execute(
            "SELECT user_id FROM group_members WHERE group_id = %s", (group_id,)
        ).fetchall()
        workouts = []
        for row in member_ids:
            workouts.extend(_fetch_workouts(db, row["user_id"], current_user["id"]))
        workouts.sort(key=lambda w: w["date"], reverse=True)
        return workouts
    finally:
        db.close()


# ─── いいね ───────────────────────────────────────────────

@app.post("/api/workouts/{workout_id}/reactions")
def toggle_reaction(workout_id: int, current_user=Depends(auth.get_current_user)):
    db = database.get_db()
    try:
        existing = db.execute(
            "SELECT id FROM reactions WHERE workout_id = %s AND user_id = %s",
            (workout_id, current_user["id"]),
        ).fetchone()
        if existing:
            db.execute("DELETE FROM reactions WHERE id = %s", (existing["id"],))
            db.commit()
            return {"liked": False}
        else:
            db.execute(
                "INSERT INTO reactions (workout_id, user_id) VALUES (%s, %s)",
                (workout_id, current_user["id"]),
            )
            db.commit()
            return {"liked": True}
    finally:
        db.close()


# ─── コメント ─────────────────────────────────────────────

@app.post("/api/workouts/{workout_id}/comments")
def add_comment(workout_id: int, data: models.CommentIn, current_user=Depends(auth.get_current_user)):
    db = database.get_db()
    try:
        cur = db.execute(
            "INSERT INTO comments (workout_id, user_id, content) VALUES (%s, %s, %s) RETURNING id",
            (workout_id, current_user["id"], data.content),
        )
        comment_id = cur.fetchone()["id"]
        db.commit()
        return {"id": comment_id, "content": data.content, "username": current_user["username"]}
    finally:
        db.close()


@app.get("/api/workouts/{workout_id}/comments")
def get_comments(workout_id: int, current_user=Depends(auth.get_current_user)):
    db = database.get_db()
    try:
        rows = db.execute(
            """SELECT c.id, c.content, c.created_at, u.username
               FROM comments c JOIN users u ON c.user_id = u.id
               WHERE c.workout_id = %s ORDER BY c.created_at""",
            (workout_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        db.close()


# ─── イベント（合トレ）────────────────────────────────────

@app.post("/api/groups/{group_id}/events")
def create_event(group_id: int, data: models.EventCreate, current_user=Depends(auth.get_current_user)):
    db = database.get_db()
    try:
        _assert_member(db, group_id, current_user["id"])
        cur = db.execute(
            "INSERT INTO events (group_id, title, date, location, description, created_by) VALUES (%s, %s, %s, %s, %s, %s) RETURNING id",
            (group_id, data.title, data.date, data.location, data.description, current_user["id"]),
        )
        event_id = cur.fetchone()["id"]
        db.commit()
        return {"id": event_id, "title": data.title, "date": data.date}
    finally:
        db.close()


@app.get("/api/groups/{group_id}/events")
def get_events(group_id: int, current_user=Depends(auth.get_current_user)):
    db = database.get_db()
    try:
        _assert_member(db, group_id, current_user["id"])
        rows = db.execute(
            """SELECT e.*, u.username as creator_name,
                      (SELECT COUNT(*) FROM event_participants ep WHERE ep.event_id = e.id AND ep.status='going') as going_count,
                      (SELECT ep2.status FROM event_participants ep2 WHERE ep2.event_id = e.id AND ep2.user_id = %s) as my_status
               FROM events e JOIN users u ON e.created_by = u.id
               WHERE e.group_id = %s ORDER BY e.date""",
            (current_user["id"], group_id),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        db.close()


@app.post("/api/events/{event_id}/respond")
def respond_event(event_id: int, data: models.EventRespond, current_user=Depends(auth.get_current_user)):
    if data.status not in ("going", "not_going", "pending"):
        raise HTTPException(status_code=400, detail="status は going / not_going / pending のいずれか")
    db = database.get_db()
    try:
        db.execute(
            """INSERT INTO event_participants (event_id, user_id, status, updated_at)
               VALUES (%s, %s, %s, NOW())
               ON CONFLICT(event_id, user_id) DO UPDATE SET status=EXCLUDED.status, updated_at=NOW()""",
            (event_id, current_user["id"], data.status),
        )
        db.commit()
        return {"status": data.status}
    finally:
        db.close()


# ─── ランキング & ストリーク ──────────────────────────────

@app.get("/api/groups/{group_id}/ranking")
def group_ranking(group_id: int, current_user=Depends(auth.get_current_user)):
    db = database.get_db()
    try:
        _assert_member(db, group_id, current_user["id"])
        rows = db.execute(
            """SELECT u.id, u.username, COUNT(w.id) as workout_count
               FROM group_members gm
               JOIN users u ON gm.user_id = u.id
               LEFT JOIN workouts w ON w.user_id = u.id
               WHERE gm.group_id = %s
               GROUP BY u.id ORDER BY workout_count DESC""",
            (group_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        db.close()


@app.get("/api/me/streak")
def my_streak(current_user=Depends(auth.get_current_user)):
    db = database.get_db()
    try:
        dates = db.execute(
            "SELECT DISTINCT date FROM workouts WHERE user_id = %s ORDER BY date DESC",
            (current_user["id"],),
        ).fetchall()
        streak = _calc_streak([r["date"] for r in dates])
        return {"streak": streak}
    finally:
        db.close()


# ─── ユーティリティ ──────────────────────────────────────

def _assert_member(db, group_id: int, user_id: int):
    row = db.execute(
        "SELECT id FROM group_members WHERE group_id = %s AND user_id = %s", (group_id, user_id)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=403, detail="グループのメンバーではありません")


def _fetch_workouts(db, user_id: int, viewer_id: int) -> list:
    rows = db.execute(
        """SELECT w.id, w.date, w.memo, w.created_at, u.username,
                  COUNT(DISTINCT r.id) as reaction_count,
                  COUNT(DISTINCT c.id) as comment_count,
                  EXISTS(SELECT 1 FROM reactions r2 WHERE r2.workout_id = w.id AND r2.user_id = %s) as liked
           FROM workouts w
           JOIN users u ON w.user_id = u.id
           LEFT JOIN reactions r ON r.workout_id = w.id
           LEFT JOIN comments c ON c.workout_id = w.id
           WHERE w.user_id = %s
           GROUP BY w.id, w.date, w.memo, w.created_at, u.username
           ORDER BY w.date DESC""",
        (viewer_id, user_id),
    ).fetchall()
    result = []
    for row in rows:
        w = dict(row)
        exercises = db.execute(
            "SELECT exercise, sets, reps, weight FROM workout_exercises WHERE workout_id = %s",
            (w["id"],),
        ).fetchall()
        w["exercises"] = [dict(e) for e in exercises]
        result.append(w)
    return result


def _calc_streak(dates: list) -> int:
    if not dates:
        return 0
    from datetime import date, timedelta
    today = date.today()
    streak = 0
    expected = today
    for d in dates:
        workout_date = date.fromisoformat(str(d))
        if workout_date == expected or workout_date == expected - timedelta(days=1):
            streak += 1
            expected = workout_date - timedelta(days=1)
        else:
            break
    return streak
