from pydantic import BaseModel
from typing import Optional


class Register(BaseModel):
    username: str
    password: str


class Login(BaseModel):
    username: str
    password: str


class ExerciseIn(BaseModel):
    exercise: str
    sets: Optional[int] = None
    reps: Optional[int] = None
    weight: Optional[float] = None


class WorkoutIn(BaseModel):
    date: str
    memo: Optional[str] = None
    exercises: list[ExerciseIn] = []


class CommentIn(BaseModel):
    content: str


class GroupCreate(BaseModel):
    name: str
    description: Optional[str] = None


class GroupJoin(BaseModel):
    invite_code: str


class EventCreate(BaseModel):
    title: str
    date: str
    location: Optional[str] = None
    description: Optional[str] = None


class EventRespond(BaseModel):
    status: str  # "going" | "not_going" | "pending"
