# PFCNAVBAHOR_

## Ishga tushirish (3 qadam)
1. PostgreSQL'da baza yarating:  `psql -U postgres -c "CREATE DATABASE navbahor_media;"`
2. `.env.example` ni `.env` ga nusxalab, DB_PASSWORD va JWT_SECRET ni yozing.
3. Terminalda shu papka ichida:
   npm install
   npm start
Brauzerda: http://localhost:5000   (admin: .env dagi ADMIN_EMAIL / ADMIN_PASSWORD)

## Admin ish tartibi
O'yin yarating -> muxlislar taxmin qiladi -> muddat tugagach "Rasmiy tarkib" ni e'lon qiling -> olmoslar avtomatik beriladi (bir marta).

## Qo'shimcha imkoniyatlar
- 📰 **Yangiliklar**: Admin panelda sarlavha + matn (va ixtiyoriy rasm) bilan yangilik qo'shing — muxlislar bosh sahifada ko'radi.
- ✏️ **Profilni tahrirlash**: Har bir foydalanuvchi "Profil" bo'limida o'z ismini o'zgartira oladi.
- 🗑 **O'yinlarni boshqarish**: Admin panelda har bir o'yin ro'yxatidan o'yinni o'chirish mumkin.
