from typing import Optional, List
from pydantic import BaseModel
from database import OrderStatus


# This file defines the Pydantic models (schemas) used for request validation and response formatting in the FastAPI application.

class RegisterInput(BaseModel):
    name: str
    email: str
    password: str
    phone: Optional[str] = None


class LoginInput(BaseModel):
    email: str
    password: str

class UpdateProfileInput(BaseModel):
    name: str
    phone: Optional[str] = None


class ChangePasswordInput(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str


class CartItemInput(BaseModel):
    food_item_id: int
    quantity: int


class CreateOrderInput(BaseModel):
    items: List[CartItemInput]
    delivery_address: str
    phone: str
    notes: Optional[str] = None


class UpdateOrderStatusInput(BaseModel):
    status: OrderStatus
    note: Optional[str] = None


class CreateFoodItemInput(BaseModel):
    name: str
    description: Optional[str] = None
    price: float
    image_url: Optional[str] = None
    category_id: int
    is_available: bool = True


class UpdateFoodItemInput(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    image_url: Optional[str] = None
    category_id: Optional[int] = None
    is_available: Optional[bool] = None


class CreateCategoryInput(BaseModel):
    name: str
    icon: Optional[str] = None

