# PFCNAVBAHOR_

## Ishga tushirish (3 qadam)
1. PostgreSQL'da baza yarating:  `psql -U postgres -c "CREATE DATABASE navbahor_media;"`
2. `.env.example` ni `.env` ga nusxalab, `DB_PASSWORD` va `JWT_SECRET` ni yozing. Hostingdagi PostgreSQL uchun `DB_*` sozlamalari o'rniga provayder bergan `DATABASE_URL` ni ishlating.
3. Terminalda shu papka ichida:
   npm install
   npm start
Brauzerda terminalda ko'rsatilgan manzilni oching (masalan, http://localhost:5001). Agar port band bo'lsa, server keyingi portga o'tadi; eski serverni to'xtatib qayta ishga tushiring. Admin: `.env` dagi `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

`DATABASE_URL` va `DB_PASSWORD` dan bittasi talab qilinadi. Hostingda maxfiy qiymatlarni `.env` fayliga yoki GitHub'ga joylamang; hosting boshqaruv panelining environment variables bo'limida kiriting.

## Hostingga joylash
1. Bepul tarifli PostgreSQL provayderida yangi, bo'sh baza yarating va ulanish satrini hostingdagi `DATABASE_URL` ga kiriting.
2. Hosting environment variables bo'limida `JWT_SECRET` va `ADMIN_PASSWORD` ni ham belgilang (`ADMIN_EMAIL` va `ADMIN_USERNAME` ixtiyoriy).
3. Maxfiy qiymatlarni chatga yoki GitHub'ga yubormang. Yangi bazada foydalanuvchi ma'lumotlari bo'lmaydi; ilova ishga tushganda kerakli jadvallarni yaratadi.

## Admin ish tartibi
O'yin yarating -> muxlislar taxmin qiladi -> muddat tugagach "Rasmiy tarkib" ni e'lon qiling -> olmoslar avtomatik beriladi (bir marta).

## Qo'shimcha imkoniyatlar
- 📰 **Yangiliklar**: Admin panelda sarlavha + matn (va ixtiyoriy rasm) bilan yangilik qo'shing — muxlislar bosh sahifada ko'radi.
- ✏️ **Profilni tahrirlash**: Har bir foydalanuvchi "Profil" bo'limida o'z ismini o'zgartira oladi.
- 🗑 **O'yinlarni boshqarish**: Admin panelda har bir o'yin ro'yxatidan o'yinni o'chirish mumkin.
