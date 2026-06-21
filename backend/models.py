from pydantic import BaseModel

class Regist(BaseModel):
    username: str
    password: str

class Login(BaseModel):
    username: str
    password: str

class Workouts(BaseModel):
    exercise: str
    weight: int
    reps: int