from sqlalchemy import select, func
from database import AsyncSessionLocal, User, Category, FoodItem, UserRole
from security import hash_password


async def seed_data():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(func.count(Category.id)))
        if result.scalar() > 0:
            return

        categories_data = [
            ("Khmer Food", "utensils", 1),
            ("Western", "beef", 2),
            ("Drinks", "cup-soda", 3),
            ("Desserts", "cake-slice", 4),
            ("Snacks", "popcorn", 5),
        ]
        categories = []
        for name, icon, sort_order in categories_data:
            cat = Category(name=name, icon=icon, sort_order=sort_order)
            db.add(cat)
            categories.append(cat)
        await db.flush()

        items_data = [
            ("Fish Amok", "Traditional Cambodian curry steamed in banana leaf", 5.50, 1, "https://th.bing.com/th?q=Fish+Amok+Banana+Leaves&w=120&h=120&c=1&rs=1&qlt=70&o=7&cb=1&dpr=1.5&pid=InlineBlock&rm=3&mkt=en-WW&cc=KH&setlang=en&adlt=strict&t=1&mw/400/300"),
            ("Beef Lok Lak", "Stir-fried beef with fresh vegetables and lime sauce", 6.00, 1, "https://picsum.photos/seed/lok-lak/400/300"),
            ("Khmer Red Curry", "Rich coconut curry with chicken and potatoes", 5.00, 1, "https://picsum.photos/seed/red-curry-kh/400/300"),
            ("Nom Banh Chok", "Cambodian rice noodles with green curry gravy", 3.50, 1, "https://picsum.photos/seed/nom-banh-chok/400/300"),
            ("Classic Burger", "Angus beef patty with cheese and fresh veggies", 8.00, 2, "https://picsum.photos/seed/burger-classic/400/300"),
            ("Margherita Pizza", "Fresh mozzarella, tomato sauce, and basil", 9.50, 2, "https://picsum.photos/seed/pizza-marg/400/300"),
            ("Caesar Salad", "Crispy romaine with parmesan and croutons", 5.50, 2, "https://picsum.photos/seed/caesar-salad/400/300"),
            ("Pasta Carbonara", "Creamy pasta with bacon and egg", 7.50, 2, "https://picsum.photos/seed/carbonara/400/300"),
            ("Iced Coffee", "Cambodian-style iced coffee with condensed milk", 2.00, 3, "https://picsum.photos/seed/iced-coffee/400/300"),
            ("Fresh Lime Juice", "Squeezed lime with sugar and ice", 1.50, 3, "https://picsum.photos/seed/lime-juice/400/300"),
            ("Bubble Tea", "Milk tea with chewy tapioca pearls", 3.00, 3, "https://picsum.photos/seed/bubble-tea/400/300"),
            ("Mango Sticky Rice", "Sweet mango with coconut sticky rice", 3.50, 4, "https://picsum.photos/seed/mango-sticky/400/300"),
            ("Chocolate Lava Cake", "Warm cake with molten chocolate center", 4.50, 4, "https://picsum.photos/seed/lava-cake/400/300"),
            ("Spring Rolls", "Crispy fried rolls with pork and vegetables", 3.00, 5, "https://picsum.photos/seed/spring-rolls/400/300"),
            ("Chicken Wings", "Spicy fried chicken wings with dipping sauce", 4.50, 5, "https://picsum.photos/seed/chicken-wings/400/300"),
        ]
        for name, desc, price, cat_idx, img in items_data:
            item = FoodItem(
                name=name, description=desc, price=price,
                image_url=img, category_id=categories[cat_idx - 1].id
            )
            db.add(item)

        admin = User(
            name="Vee_Zee Admin",
            email="admin@com",
            password_hash=hash_password("admin123"),
            phone="85516992144",
            role=UserRole.admin
        )
        db.add(admin)

        customer = User(
            name="Lee hov",
            email="leehov@.com",
            password_hash=hash_password("1232"),
            phone="85512345678",
            role=UserRole.customer
        )
        db.add(customer)

        await db.commit()
        print("Seed data created successfully")