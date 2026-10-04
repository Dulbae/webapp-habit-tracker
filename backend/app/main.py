from datetime import date, timedelta
from os import getenv
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import Boolean, Date, ForeignKey, Integer, String, create_engine, func, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship

DATABASE_URL = getenv(
    "DATABASE_URL",
    "sqlite:///./init_habits.db",
)

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, pool_pre_ping=True, connect_args=connect_args)


class Base(DeclarativeBase):
    pass


class Habit(Base):
    __tablename__ = "habits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(String(255), default="")
    icon: Mapped[str] = mapped_column(String(8), default="○")
    group_name: Mapped[str] = mapped_column(String(30), default="morning")
    target: Mapped[str] = mapped_column(String(80), default="")
    color: Mapped[str] = mapped_column(String(30), default="green")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    completions: Mapped[list["Completion"]] = relationship(
        back_populates="habit", cascade="all, delete-orphan"
    )


class Completion(Base):
    __tablename__ = "completions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    habit_id: Mapped[int] = mapped_column(ForeignKey("habits.id"), nullable=False)
    completed_on: Mapped[date] = mapped_column(Date, nullable=False)
    habit: Mapped[Habit] = relationship(back_populates="completions")


class Profile(Base):
    __tablename__ = "profile"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(60), default="user")
    font: Mapped[str] = mapped_column(String(40), default="JetBrains Mono")
    theme: Mapped[str] = mapped_column(String(30), default="ansi-dark")
    text_size: Mapped[str] = mapped_column(String(20), default="default")
    completed_to_bottom: Mapped[bool] = mapped_column(Boolean, default=True)
    cross_out: Mapped[bool] = mapped_column(Boolean, default=False)


class HabitCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = ""
    icon: str = "○"
    group_name: str = "morning"
    target: str = ""
    color: str = "green"


class HabitUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    group_name: Optional[str] = None
    target: Optional[str] = None
    color: Optional[str] = None
    active: Optional[bool] = None


class HabitOut(HabitCreate):
    id: int
    active: bool
    completed: bool = False
    current_streak: int = 0
    best_streak: int = 0

    model_config = ConfigDict(from_attributes=True)


class ProfileOut(BaseModel):
    id: int
    username: str
    font: str
    theme: str
    text_size: str
    completed_to_bottom: bool
    cross_out: bool

    model_config = ConfigDict(from_attributes=True)


class ProfileUpdate(BaseModel):
    username: Optional[str] = None
    font: Optional[str] = None
    theme: Optional[str] = None
    text_size: Optional[str] = None
    completed_to_bottom: Optional[bool] = None
    cross_out: Optional[bool] = None


app = FastAPI(title="init.Habits API", version="1.0.0")

origins = [x.strip() for x in getenv("CORS_ORIGINS", "*").split(",") if x.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins != ["*"] else ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def completion_dates(session: Session, habit_id: int) -> set[date]:
    rows = session.scalars(
        select(Completion.completed_on).where(Completion.habit_id == habit_id)
    ).all()
    return set(rows)


def streaks(dates: set[date]) -> tuple[int, int]:
    if not dates:
        return 0, 0

    best = 0
    run = 0
    cursor = None

    for d in sorted(dates):
        if cursor is not None and d == cursor + timedelta(days=1):
            run += 1
        else:
            run = 1
        best = max(best, run)
        cursor = d

    today = date.today()
    current = 0
    cursor = today
    while cursor in dates:
        current += 1
        cursor -= timedelta(days=1)

    return current, best


def habit_to_out(session: Session, habit: Habit, day: date) -> HabitOut:
    dates = completion_dates(session, habit.id)
    current, best = streaks(dates)
    return HabitOut(
        id=habit.id,
        name=habit.name,
        description=habit.description,
        icon=habit.icon,
        group_name=habit.group_name,
        target=habit.target,
        color=habit.color,
        active=habit.active,
        completed=day in dates,
        current_streak=current,
        best_streak=best,
    )


def seed(session: Session) -> None:
    if session.scalar(select(Habit.id).limit(1)) is None:
        habits = [
            Habit(name="Make the bed", icon="▣", group_name="morning", target="daily"),
            Habit(name="Brush teeth", icon="◉", group_name="morning", target="2× daily"),
            Habit(name="Drink 2L water", icon="◆", group_name="morning", target="2 L"),
            Habit(name="Focused work", icon="▤", group_name="focused", target="2 sessions"),
            Habit(name="Stretch", icon="⌁", group_name="focused", target="10 min"),
            Habit(name="Read 20 pages", icon="▥", group_name="focused", target="20 pages"),
            Habit(name="Walk 7k steps", icon="⌖", group_name="focused", target="7k steps"),
            Habit(name="Take a shower", icon="◇", group_name="evening", target="daily"),
            Habit(name="Apply eye cream", icon="○", group_name="evening", target="daily"),
            Habit(name="In bed before 11pm", icon="□", group_name="evening", target="23:00"),
            Habit(name="No junk food", icon="!", group_name="special", target="daily"),
        ]
        session.add_all(habits)
    if session.scalar(select(Profile.id).limit(1)) is None:
        session.add(Profile())
    session.commit()


@app.on_event("startup")
def startup():
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        seed(session)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/habits", response_model=list[HabitOut])
def list_habits(day: date = Query(default_factory=date.today)):
    with Session(engine) as session:
        habits = session.scalars(
            select(Habit).where(Habit.active.is_(True)).order_by(Habit.id)
        ).all()
        return [habit_to_out(session, h, day) for h in habits]


@app.post("/api/habits", response_model=HabitOut)
def create_habit(payload: HabitCreate):
    with Session(engine) as session:
        habit = Habit(**payload.model_dump())
        session.add(habit)
        session.commit()
        session.refresh(habit)
        return habit_to_out(session, habit, date.today())


@app.patch("/api/habits/{habit_id}", response_model=HabitOut)
def update_habit(habit_id: int, payload: HabitUpdate):
    with Session(engine) as session:
        habit = session.get(Habit, habit_id)
        if not habit:
            raise HTTPException(404, "Habit not found")
        for key, value in payload.model_dump(exclude_unset=True).items():
            setattr(habit, key, value)
        session.commit()
        session.refresh(habit)
        return habit_to_out(session, habit, date.today())


@app.delete("/api/habits/{habit_id}")
def delete_habit(habit_id: int):
    with Session(engine) as session:
        habit = session.get(Habit, habit_id)
        if not habit:
            raise HTTPException(404, "Habit not found")
        session.delete(habit)
        session.commit()
        return {"deleted": True}


@app.post("/api/habits/{habit_id}/toggle")
def toggle_habit(habit_id: int, day: date = Query(default_factory=date.today)):
    with Session(engine) as session:
        habit = session.get(Habit, habit_id)
        if not habit:
            raise HTTPException(404, "Habit not found")
        existing = session.scalar(
            select(Completion).where(
                Completion.habit_id == habit_id,
                Completion.completed_on == day,
            )
        )
        if existing:
            session.delete(existing)
            completed = False
        else:
            session.add(Completion(habit_id=habit_id, completed_on=day))
            completed = True
        session.commit()
        return {"habit_id": habit_id, "date": day, "completed": completed}


@app.get("/api/stats")
def stats(days: int = Query(30, ge=7, le=3650)):
    end = date.today()
    start = end - timedelta(days=days - 1)

    with Session(engine) as session:
        habits = session.scalars(select(Habit).where(Habit.active.is_(True))).all()
        total_possible = len(habits) * days
        total_completed = session.scalar(
            select(func.count(Completion.id)).where(
                Completion.completed_on >= start,
                Completion.completed_on <= end,
            )
        ) or 0

        by_day = []
        for i in range(days):
            d = start + timedelta(days=i)
            count = session.scalar(
                select(func.count(Completion.id)).where(Completion.completed_on == d)
            ) or 0
            by_day.append({"date": d.isoformat(), "count": count})

        habit_stats = []
        for habit in habits:
            count = session.scalar(
                select(func.count(Completion.id)).where(
                    Completion.habit_id == habit.id,
                    Completion.completed_on >= start,
                    Completion.completed_on <= end,
                )
            ) or 0
            current, best = streaks(completion_dates(session, habit.id))
            habit_stats.append(
                {
                    "id": habit.id,
                    "name": habit.name,
                    "count": count,
                    "current_streak": current,
                    "best_streak": best,
                }
            )

        rate = round((total_completed / total_possible) * 100) if total_possible else 0
        return {
            "start": start,
            "end": end,
            "days": days,
            "total_completions": total_completed,
            "completion_rate": rate,
            "completed_days": sum(1 for x in by_day if x["count"] > 0),
            "by_day": by_day,
            "habit_stats": habit_stats,
        }


@app.get("/api/achievements")
def achievements():
    with Session(engine) as session:
        total = session.scalar(select(func.count(Completion.id))) or 0
        habits = session.scalars(select(Habit)).all()
        max_habit = 0
        max_name = "—"
        routine_days = 0

        for habit in habits:
            count = session.scalar(
                select(func.count(Completion.id)).where(Completion.habit_id == habit.id)
            ) or 0
            if count > max_habit:
                max_habit = count
                max_name = habit.name

        if habits:
            for d in range(60):
                day = date.today() - timedelta(days=d)
                completed = session.scalar(
                    select(func.count(Completion.id)).where(Completion.completed_on == day)
                ) or 0
                if completed >= len(habits):
                    routine_days += 1

        return {
            "total_completions": total,
            "dedication": {"value": max_habit, "target": 365, "habit": max_name},
            "goal_days": {"value": routine_days, "target": 21},
            "routine_runner": {"value": min(total // 10, 15), "target": 15},
            "tier": "bronze" if total < 500 else "silver" if total < 1000 else "gold",
        }


@app.get("/api/profile", response_model=ProfileOut)
def get_profile():
    with Session(engine) as session:
        profile = session.scalar(select(Profile).limit(1))
        return profile


@app.patch("/api/profile", response_model=ProfileOut)
def update_profile(payload: ProfileUpdate):
    with Session(engine) as session:
        profile = session.scalar(select(Profile).limit(1))
        if not profile:
            profile = Profile()
            session.add(profile)
        for key, value in payload.model_dump(exclude_unset=True).items():
            setattr(profile, key, value)
        session.commit()
        session.refresh(profile)
        return profile
